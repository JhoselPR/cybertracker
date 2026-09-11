import type { InteractionFrame } from '../../types/interaction'
import type {
  FrameSubscriber,
  StoreSubscriber,
  UiEndReason,
  UiInputEvent,
  UiInputFrame,
  UiPoint,
  UiSemanticSnapshot,
} from './types'

const clonePoint = (point: UiPoint): UiPoint => ({ x: point.x, y: point.y })

function endReason(reason: string): UiEndReason {
  if (reason === 'released' || reason === 'tracking_lost') return reason
  return 'source_cancelled'
}

function cloneInteractionFrame(frame: InteractionFrame): UiInputFrame {
  const pointerState = frame.pointer?.stale ? 'stale' : frame.state
  const events: UiInputEvent[] = frame.events.map((event) => {
    const base = { position: clonePoint(event.position), timestampMs: event.timestampMs }
    switch (event.type) {
      case 'pointermove': return { ...base, type: 'move' }
      case 'pinchstart': return { ...base, type: 'pressstart' }
      case 'pinchmove': return { ...base, type: 'pressmove' }
      case 'pinchend': return { ...base, type: 'pressend', reason: endReason(event.reason) }
      case 'dragstart': return { ...base, type: 'dragstart' }
      case 'dragmove': return { ...base, type: 'dragmove' }
      case 'dragend': return { ...base, type: 'dragend', reason: endReason(event.reason) }
    }
  })

  return {
    source: 'hand',
    timestampMs: frame.timestampMs,
    pointer: frame.pointer ? {
      position: clonePoint(frame.pointer.position),
      state: pointerState,
      visible: frame.pointer.tracked || frame.pointer.stale,
    } : null,
    events,
  }
}

export class InteractionBridge {
  private readonly frameSubscribers = new Set<FrameSubscriber>()
  private readonly storeSubscribers = new Set<StoreSubscriber>()
  private snapshot: UiSemanticSnapshot
  private publishing = false
  private notificationPending = false

  constructor(initialSnapshot: UiSemanticSnapshot) {
    this.snapshot = initialSnapshot
  }

  readonly subscribeFrames = (subscriber: FrameSubscriber): (() => void) => {
    this.frameSubscribers.add(subscriber)
    return () => this.frameSubscribers.delete(subscriber)
  }

  readonly subscribe = (subscriber: StoreSubscriber): (() => void) => {
    this.storeSubscribers.add(subscriber)
    return () => this.storeSubscribers.delete(subscriber)
  }

  readonly getSnapshot = (): UiSemanticSnapshot => this.snapshot

  publishInteractionFrame(frame: InteractionFrame): void {
    this.publishInputFrame(cloneInteractionFrame(frame))
  }

  publishInputFrame(frame: UiInputFrame): void {
    const safeFrame: UiInputFrame = {
      source: frame.source,
      timestampMs: frame.timestampMs,
      pointer: frame.pointer ? {
        ...frame.pointer,
        position: clonePoint(frame.pointer.position),
      } : null,
      events: frame.events.map((event) => ({
        ...event,
        position: event.position ? clonePoint(event.position) : null,
      })) as UiInputEvent[],
    }

    this.publishing = true
    for (const subscriber of [...this.frameSubscribers]) {
      try {
        subscriber(safeFrame)
      } catch (error) {
        console.error('Interaction frame subscriber failed', error)
      }
    }
    this.publishing = false
    if (this.notificationPending) {
      this.notificationPending = false
      this.notifyStore()
    }
  }

  setSnapshot(snapshot: UiSemanticSnapshot): void {
    if (Object.is(snapshot, this.snapshot)) return
    this.snapshot = snapshot
    if (this.publishing) this.notificationPending = true
    else this.notifyStore()
  }

  private notifyStore(): void {
    for (const subscriber of [...this.storeSubscribers]) {
      try {
        subscriber()
      } catch (error) {
        console.error('Interaction store subscriber failed', error)
      }
    }
  }
}
