import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import type { HudPanelState, InteractionRuntime, UiPoint } from '../../lib/interaction-bridge'
import { HudButton } from './HudButton'

interface HudPanelProps {
  runtime: InteractionRuntime
  panel: Readonly<HudPanelState>
  hoveredId: string | null
  pressedId: string | null
  title: string
  children: ReactNode
}

export function HudPanel({ runtime, panel, hoveredId, pressedId, title, children }: HudPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef(panel.position)
  const headerId = `panel-header:${panel.id}`
  const closeId = `panel-close:${panel.id}`

  const applyPosition = (position: UiPoint): void => {
    const node = panelRef.current
    if (node) node.style.transform = `translate3d(${position.x * window.innerWidth}px, ${position.y * window.innerHeight}px, 0)`
  }

  useLayoutEffect(() => {
    positionRef.current = panel.position
    applyPosition(panel.position)
    runtime.kernel.registry.invalidate(headerId)
  }, [headerId, panel.position, runtime])

  useEffect(() => {
    const header = headerRef.current
    const panelNode = panelRef.current
    if (!header || !panelNode) return
    const unregister = runtime.kernel.registerTarget({
      id: headerId,
      kind: 'panel-header',
      zRank: 0,
      enabled: true,
      element: header,
      getBounds: () => header.getBoundingClientRect(),
      panelDrag: {
        panelId: panel.id,
        measure: () => ({
          width: panelNode.offsetWidth,
          height: panelNode.offsetHeight,
          headerHeight: header.offsetHeight,
        }),
        applyLivePosition: (position) => position ? applyPosition(position) : applyPosition(positionRef.current),
      },
    })
    runtime.kernel.handleViewportChange()
    return unregister
  }, [headerId, panel.id, runtime])

  useEffect(() => {
    runtime.kernel.registry.update(headerId, { zRank: panel.z * 1000 })
  }, [headerId, panel.z, runtime])

  return (
    <section ref={panelRef} className="hud-panel" style={{ zIndex: panel.z + 20 }} aria-labelledby={`${panel.id}-title`}>
      <div ref={headerRef} className="hud-panel-header" data-dragging={pressedId === headerId || undefined}>
        <span className="panel-index" aria-hidden="true">{panel.id.slice(0, 2).toUpperCase()}</span>
        <h2 id={`${panel.id}-title`}>{title}</h2>
        <HudButton
          runtime={runtime}
          id={closeId}
          label={`Close ${title} panel`}
          className="panel-close"
          kind="control"
          zRank={panel.z * 1000 + 1}
          hovered={hoveredId === closeId}
          pressed={pressedId === closeId}
          onActivate={() => runtime.kernel.closePanel(panel.id)}
        >
          <span aria-hidden="true">CLOSE</span>
        </HudButton>
      </div>
      <div className="hud-panel-content">{children}</div>
    </section>
  )
}
