import type { HologramSemanticState } from '../../types/spatialInteraction'

export type HologramStateSubscriber = (state: Readonly<HologramSemanticState>) => void

const clone = (state: HologramSemanticState): HologramSemanticState => structuredClone(state)

export class HologramStateChannel {
  private readonly subscribers = new Set<HologramStateSubscriber>()
  private latest: HologramSemanticState

  constructor(initialState: HologramSemanticState) {
    this.latest = clone(initialState)
  }

  subscribe(subscriber: HologramStateSubscriber): () => void {
    this.subscribers.add(subscriber)
    this.notify(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  publish(state: HologramSemanticState): void {
    this.latest = clone(state)
    for (const subscriber of [...this.subscribers]) this.notify(subscriber)
  }

  getSnapshot(): Readonly<HologramSemanticState> {
    return clone(this.latest)
  }

  dispose(): void {
    this.publish({
      ...this.latest,
      mode: 'palm-anchored',
      interactionState: 'idle',
      transform: null,
      anchorTrackId: null,
      interactionTrackId: null,
      hovered: false,
      grabbed: false,
      visible: false,
      opacity: 0,
      cursorState: 'normal',
      events: [],
      debug: { targetId: null, ray: null, grabOffset: null, depthRatio: 1, grabDurationMs: 0, lastEvent: null },
    })
    this.subscribers.clear()
  }

  private notify(subscriber: HologramStateSubscriber): void {
    try {
      subscriber(clone(this.latest))
    } catch (error) {
      console.error('Hologram state subscriber failed', error)
    }
  }
}
