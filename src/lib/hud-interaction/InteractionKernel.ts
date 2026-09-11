import type {
  HudPanelState,
  UiInputEvent,
  UiInputFrame,
  UiInputSource,
  UiPoint,
  UiSemanticSnapshot,
} from '../interaction-bridge/types'
import { hitTest } from './hitTest'
import { clampPanelPosition, PanelDragSession } from './panelDrag'
import { TargetRegistry, type RegistryMutation } from './TargetRegistry'
import type { ActivePointer, PanelDragCallbacks, TargetDefinition, ViewportSize } from './types'

const PANEL_STARTS: Record<string, UiPoint> = {
  system: { x: 0.36, y: 0.4 },
  vision: { x: 0.58, y: 0.25 },
  hardware: { x: 0.36, y: 0.58 },
  network: { x: 0.6, y: 0.52 },
}

function initialPanels(): Readonly<Record<string, Readonly<HudPanelState>>> {
  return Object.freeze(Object.fromEntries(Object.entries(PANEL_STARTS).map(([id, position], index) => [id, Object.freeze({
    id,
    open: false,
    position: Object.freeze({ ...position }),
    z: index + 1,
  })])))
}

export function createInitialSnapshot(debug = import.meta.env.DEV): UiSemanticSnapshot {
  return Object.freeze({
    hoveredId: null,
    pressedId: null,
    capturedId: null,
    activeSource: null,
    panels: initialPanels(),
    debug,
  })
}

interface DragCapture {
  targetId: string
  callbacks: PanelDragCallbacks
  session: PanelDragSession
}

export class InteractionKernel {
  readonly registry: TargetRegistry
  private snapshot: UiSemanticSnapshot
  private pointer: ActivePointer | null = null
  private dragged = false
  private dragCapture: DragCapture | null = null

  constructor(
    initialSnapshot: UiSemanticSnapshot,
    private readonly publishSnapshot: (snapshot: UiSemanticSnapshot) => void,
    private readonly getViewport: () => ViewportSize = () => ({
      width: typeof window === 'undefined' ? 1 : window.innerWidth,
      height: typeof window === 'undefined' ? 1 : window.innerHeight,
    }),
  ) {
    this.snapshot = initialSnapshot
    this.registry = new TargetRegistry((mutation) => this.handleRegistryMutation(mutation))
  }

  consumeFrame(frame: UiInputFrame): void {
    const sourceOwned = Boolean(this.snapshot.pressedId || this.snapshot.capturedId)
    if (sourceOwned && this.snapshot.activeSource !== frame.source) return
    if (frame.pointer) this.updatePointer(frame.source, frame.pointer.position)
    for (const event of frame.events) this.consumeEvent(frame.source, event)
    if (frame.source === 'hand' && !frame.pointer) {
      this.pointer = null
      this.updateHover(null)
      if (!this.snapshot.pressedId && !this.snapshot.capturedId) this.commit({ activeSource: null })
    }
  }

  registerTarget(definition: TargetDefinition): () => void {
    return this.registry.register(definition)
  }

  connect(): () => void {
    return this.registry.connect()
  }

  activateTarget(id: string): void {
    const target = this.registry.get(id)
    if (target?.enabled) target.activate?.()
  }

  openPanel(id: string): void {
    const panel = this.snapshot.panels[id]
    const position = panel && this.getViewport().width <= 640 && this.snapshot.debug
      ? { x: 0.01, y: Math.max(0.4, panel.position.y) }
      : panel?.position
    this.updatePanel(id, { open: true, position }, true)
  }

  closePanel(id: string): void {
    this.updatePanel(id, { open: false })
  }

  focusPanel(id: string): void {
    this.updatePanel(id, {}, true)
  }

  toggleDebug(): void {
    this.commit({ debug: !this.snapshot.debug })
  }

  handleViewportChange(): void {
    let panels = this.snapshot.panels
    for (const target of this.registry.all()) {
      const drag = target.panelDrag
      const panel = drag ? panels[drag.panelId] : null
      if (!drag || !panel?.open) continue
      const position = clampPanelPosition(panel.position, drag.measure(), this.getViewport())
      drag.applyLivePosition(position)
      if (position.x !== panel.position.x || position.y !== panel.position.y) {
        panels = { ...panels, [panel.id]: Object.freeze({ ...panel, position: Object.freeze(position) }) }
      }
    }
    if (panels !== this.snapshot.panels) this.commit({ panels: Object.freeze(panels) })
    this.registry.invalidate()
    if (this.pointer) this.updateHover(this.pointer.client)
  }

  reset(reason: 'tracking_lost' | 'source_replaced' = 'source_replaced'): void {
    this.cancelActive(reason)
    this.pointer = null
    this.updateHover(null)
  }

  dispose(): void {
    this.reset()
    this.registry.dispose()
  }

  private consumeEvent(source: UiInputSource, event: UiInputEvent): void {
    if (event.position) this.updatePointer(source, event.position)
    switch (event.type) {
      case 'move':
      case 'pressmove':
        return
      case 'pressstart':
        this.pressStart(source)
        return
      case 'dragstart':
        this.dragStart(source)
        return
      case 'dragmove':
        this.dragMove(source)
        return
      case 'dragend':
        this.dragEnd(event.reason)
        return
      case 'pressend':
        this.pressEnd(event.reason)
        return
      case 'cancel':
        this.cancelActive(event.reason)
    }
  }

  private updatePointer(source: UiInputSource, normalized: UiPoint): void {
    const sourceOwned = Boolean(this.snapshot.pressedId || this.snapshot.capturedId)
    if (sourceOwned && this.snapshot.activeSource !== source) return
    const viewport = this.getViewport()
    this.pointer = {
      source,
      normalized: { ...normalized },
      client: { x: normalized.x * viewport.width, y: normalized.y * viewport.height },
    }
    if (!sourceOwned && this.snapshot.activeSource !== source) this.commit({ activeSource: source })
    this.updateHover(this.pointer.client)
  }

  private updateHover(client: UiPoint | null): void {
    const hoveredId = client ? hitTest(this.registry, client)?.id ?? null : null
    if (hoveredId !== this.snapshot.hoveredId) this.commit({ hoveredId })
  }

  private pressStart(source: UiInputSource): void {
    if (!this.pointer || this.snapshot.pressedId || this.snapshot.capturedId) return
    const target = hitTest(this.registry, this.pointer.client)
    if (!target?.enabled) return
    this.dragged = false
    if (target.kind === 'panel-header' && target.panelDrag) this.focusPanel(target.panelDrag.panelId)
    this.commit({ pressedId: target.id, activeSource: source })
  }

  private dragStart(source: UiInputSource): void {
    if (!this.pointer || this.snapshot.activeSource !== source || !this.snapshot.pressedId) return
    const target = this.registry.get(this.snapshot.pressedId)
    if (!target?.enabled) return this.cancelActive('source_cancelled')
    this.dragged = true
    if (!target.panelDrag) return
    const panel = this.snapshot.panels[target.panelDrag.panelId]
    if (!panel) return
    const session = new PanelDragSession(panel.position, this.pointer.client, target.panelDrag.measure(), this.getViewport())
    this.dragCapture = { targetId: target.id, callbacks: target.panelDrag, session }
    target.panelDrag.onDragStart?.()
    this.commit({ capturedId: target.id })
  }

  private dragMove(source: UiInputSource): void {
    if (!this.pointer || this.snapshot.activeSource !== source || !this.dragCapture) return
    const position = this.dragCapture.session.move(this.pointer.client)
    this.dragCapture.callbacks.applyLivePosition(position)
    this.dragCapture.callbacks.onDragMove?.(position)
  }

  private dragEnd(reason: string): void {
    const capture = this.dragCapture
    if (!capture) return
    if (reason === 'released') {
      const position = capture.session.current()
      capture.callbacks.applyLivePosition(position)
      capture.callbacks.onDragEnd?.(position)
      this.updatePanel(capture.callbacks.panelId, { position })
      this.registry.invalidate()
    } else {
      capture.callbacks.applyLivePosition(null)
      capture.callbacks.onDragCancel?.()
    }
    this.dragCapture = null
    this.commit({ capturedId: null })
    if (this.pointer) this.updateHover(this.pointer.client)
  }

  private pressEnd(reason: string): void {
    const pressedId = this.snapshot.pressedId
    if (!pressedId) return this.commit({ activeSource: null, capturedId: null })
    const releaseTarget = this.pointer ? hitTest(this.registry, this.pointer.client) : null
    const pressed = this.registry.get(pressedId)
    const shouldActivate = reason === 'released'
      && !this.dragged
      && releaseTarget?.id === pressedId
      && pressed?.enabled
    this.dragEnd(reason)
    this.dragged = false
    this.commit({ pressedId: null, capturedId: null, activeSource: null })
    if (shouldActivate) pressed.activate?.()
  }

  private cancelActive(reason: string): void {
    this.dragEnd(reason)
    this.dragged = false
    if (this.snapshot.pressedId || this.snapshot.capturedId || this.snapshot.activeSource) {
      this.commit({ pressedId: null, capturedId: null, activeSource: null })
    }
  }

  private handleRegistryMutation(mutation: RegistryMutation): void {
    if (mutation.type === 'bounds-dirty') {
      this.handleViewportChange()
      return
    }
    const { id } = mutation
    if (this.snapshot.capturedId === id || this.snapshot.pressedId === id) this.cancelActive('source_cancelled')
    if (this.snapshot.hoveredId === id) this.updateHover(this.pointer?.client ?? null)
  }

  private updatePanel(id: string, patch: Partial<Pick<HudPanelState, 'open' | 'position'>>, raise = false): void {
    const panel = this.snapshot.panels[id]
    if (!panel) return
    const highestZ = Math.max(0, ...Object.values(this.snapshot.panels).map((entry) => entry.z))
    const next = Object.freeze({
      ...panel,
      ...patch,
      position: Object.freeze({ ...(patch.position ?? panel.position) }),
      z: raise ? highestZ + 1 : panel.z,
    })
    if (next.open === panel.open && next.position.x === panel.position.x && next.position.y === panel.position.y && next.z === panel.z) return
    this.commit({ panels: Object.freeze({ ...this.snapshot.panels, [id]: next }) })
  }

  private commit(patch: Partial<UiSemanticSnapshot>): void {
    const next = Object.freeze({ ...this.snapshot, ...patch })
    if (
      next.hoveredId === this.snapshot.hoveredId
      && next.pressedId === this.snapshot.pressedId
      && next.capturedId === this.snapshot.capturedId
      && next.activeSource === this.snapshot.activeSource
      && next.panels === this.snapshot.panels
      && next.debug === this.snapshot.debug
    ) return
    this.snapshot = next
    this.publishSnapshot(next)
  }
}
