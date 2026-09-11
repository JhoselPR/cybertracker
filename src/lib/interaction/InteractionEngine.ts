import { projectSourceToViewport } from '../coordinates'
import type { EnrichedHand, EnrichedTrackingFrame } from '../../types/gestures'
import type {
  DragSnapshot,
  InteractionContext,
  InteractionEndReason,
  InteractionEngineOptions,
  InteractionEvent,
  InteractionFrame,
  InteractionState,
  Position2D,
  Velocity2D,
  VirtualPointer,
} from '../../types/interaction'
import { resolveInteractionOptions } from './config'
import { PointerFilter } from './PointerFilter'
import { findPrimaryHand, selectPrimaryHand } from './primaryHand'
import { intentForGesture, transitionInteractionState } from './stateMachine'

const ZERO_VELOCITY: Velocity2D = { x: 0, y: 0, magnitude: 0 }

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function copyPosition(position: Position2D): Position2D {
  return { x: position.x, y: position.y }
}

function geometryKey(context: InteractionContext): string {
  return `${context.sourceWidth}:${context.sourceHeight}:${context.viewportWidth}:${context.viewportHeight}:${context.mirrorX}`
}

function dragSnapshot(
  startPosition: Position2D,
  previousPosition: Position2D,
  currentPosition: Position2D,
  pathLength: number,
  startTimestampMs: number,
  timestampMs: number,
): DragSnapshot {
  const dx = currentPosition.x - previousPosition.x
  const dy = currentPosition.y - previousPosition.y
  const totalX = currentPosition.x - startPosition.x
  const totalY = currentPosition.y - startPosition.y
  return {
    startPosition: copyPosition(startPosition),
    currentPosition: copyPosition(currentPosition),
    delta: { x: dx, y: dy },
    totalDelta: { x: totalX, y: totalY },
    distance: Math.hypot(totalX, totalY),
    pathLength: pathLength + Math.hypot(dx, dy),
    durationMs: timestampMs - startTimestampMs,
  }
}

export class InteractionEngine {
  private readonly options: InteractionEngineOptions
  private readonly filter: PointerFilter
  private state: InteractionState = 'idle'
  private primary: { trackId: number; handedness: EnrichedHand['handedness'] } | null = null
  private pointer: VirtualPointer | null = null
  private drag: DragSnapshot | null = null
  private pinchOrigin: Position2D | null = null
  private pinchStartedAt = 0
  private lossStartedAt: number | null = null
  private lastTimestampMs: number | null = null
  private lastGeometryKey: string | null = null
  private disposed = false

  constructor(options: Partial<InteractionEngineOptions> = {}) {
    this.options = resolveInteractionOptions(options)
    this.filter = new PointerFilter(this.options)
  }

  processFrame(frame: EnrichedTrackingFrame, context: InteractionContext): InteractionFrame {
    if (this.disposed) throw new Error('InteractionEngine has been disposed')
    const timestampMs = frame.timestampMs
    if (!Number.isFinite(timestampMs)) throw new RangeError('timestampMs must be finite')
    if (this.lastTimestampMs !== null && timestampMs < this.lastTimestampMs) {
      throw new RangeError('timestampMs must not decrease')
    }

    // Projection validates all dimensions before state can be mutated.
    projectSourceToViewport({ x: 0, y: 0 }, context.sourceWidth, context.sourceHeight,
      context.viewportWidth, context.viewportHeight, context.mirrorX)
    if (this.lastTimestampMs === timestampMs) return this.snapshot(timestampMs, [])
    const nextGeometryKey = geometryKey(context)
    const geometryChanged = this.lastGeometryKey !== null && this.lastGeometryKey !== nextGeometryKey
    this.lastGeometryKey = nextGeometryKey
    this.lastTimestampMs = timestampMs

    if (geometryChanged) this.rebaseGeometry(frame, context, timestampMs)

    let hand = this.primary ? findPrimaryHand(frame.hands, this.primary.trackId) : null
    if (!this.primary) {
      hand = selectPrimaryHand(frame.hands)
      if (hand) this.acquire(hand)
    }

    if (!hand) return this.handleMissing(timestampMs)
    this.lossStartedAt = null
    this.primary!.handedness = hand.handedness

    const position = this.filteredPosition(hand, context, timestampMs)
    const previousPosition = this.pointer?.position ?? position
    const dt = this.pointer && this.lastTimestampMs !== null
      ? (timestampMs - (this.pointerTimestampMs ?? timestampMs)) / 1000
      : 0
    const velocity = dt > 0
      ? {
          x: (position.x - previousPosition.x) / dt,
          y: (position.y - previousPosition.y) / dt,
          magnitude: Math.hypot(position.x - previousPosition.x, position.y - previousPosition.y) / dt,
        }
      : ZERO_VELOCITY
    const changed = position.x !== previousPosition.x || position.y !== previousPosition.y
    this.pointer = {
      position,
      velocity,
      active: false,
      tracked: true,
      stale: false,
    }
    this.pointerTimestampMs = timestampMs

    const intent = intentForGesture(hand.stableGesture.gesture)
    const distanceFromOrigin = this.pinchOrigin
      ? Math.hypot(position.x - this.pinchOrigin.x, position.y - this.pinchOrigin.y)
      : 0
    const transition = transitionInteractionState(this.state, intent, distanceFromOrigin >= this.options.dragThreshold)
    const events: InteractionEvent[] = []
    const wasActive = this.state !== 'idle'
    const willBeActive = transition.next !== 'idle'
    if (changed && (wasActive || willBeActive)) events.push(this.pointerEvent('pointermove', timestampMs))

    if (transition.pinchStarted) {
      this.pinchOrigin = copyPosition(position)
      this.pinchStartedAt = timestampMs
      this.drag = dragSnapshot(position, position, position, 0, timestampMs, timestampMs)
      events.push(this.pointerEvent('pinchstart', timestampMs))
    }
    if (transition.pinchMoved && !geometryChanged) events.push(this.pointerEvent('pinchmove', timestampMs))

    if (this.pinchOrigin && (transition.dragStarted || transition.dragMoved || transition.dragEnded)) {
      const previousDragPosition = this.drag?.currentPosition ?? this.pinchOrigin
      this.drag = dragSnapshot(
        this.pinchOrigin,
        previousDragPosition,
        position,
        this.drag?.pathLength ?? 0,
        this.pinchStartedAt,
        timestampMs,
      )
    }
    if (transition.dragStarted) events.push(this.dragEvent('dragstart', timestampMs))
    if (transition.dragMoved && !geometryChanged) events.push(this.dragEvent('dragmove', timestampMs))
    if (transition.dragEnded) events.push(this.dragEndEvent(timestampMs, 'released'))
    if (transition.pinchEnded) events.push(this.pinchEndEvent(timestampMs, 'released'))

    this.state = transition.next
    this.pointer.active = this.state !== 'idle'
    if (transition.pinchEnded) {
      this.pinchOrigin = null
      this.drag = null
    }
    return this.snapshot(timestampMs, events)
  }

  private pointerTimestampMs: number | null = null

  private acquire(hand: EnrichedHand): void {
    this.primary = { trackId: hand.trackId, handedness: hand.handedness }
    this.filter.reset()
    this.pointer = null
    this.pointerTimestampMs = null
  }

  private filteredPosition(hand: EnrichedHand, context: InteractionContext, timestampMs: number): Position2D {
    const tip = hand.landmarks[8]
    const projected = projectSourceToViewport(
      { x: tip.x, y: tip.y },
      context.sourceWidth,
      context.sourceHeight,
      context.viewportWidth,
      context.viewportHeight,
      context.mirrorX,
    )
    const filtered = this.filter.filter(projected, timestampMs)
    return { x: clamp(filtered.x), y: clamp(filtered.y) }
  }

  private rebaseGeometry(frame: EnrichedTrackingFrame, context: InteractionContext, timestampMs: number): void {
    this.filter.reset()
    this.pointerTimestampMs = null
    if (!this.primary) return
    const hand = findPrimaryHand(frame.hands, this.primary.trackId)
    if (!hand) return
    const position = this.filteredPosition(hand, context, timestampMs)
    this.pointer = { position, velocity: ZERO_VELOCITY, active: this.state !== 'idle', tracked: true, stale: false }
    this.pointerTimestampMs = timestampMs
    if (this.pinchOrigin) {
      this.pinchOrigin = copyPosition(position)
      this.pinchStartedAt = timestampMs
      this.drag = dragSnapshot(position, position, position, 0, timestampMs, timestampMs)
    }
  }

  private handleMissing(timestampMs: number): InteractionFrame {
    if (!this.primary) return this.snapshot(timestampMs, [])
    if (this.lossStartedAt === null) this.lossStartedAt = timestampMs
    const elapsed = timestampMs - this.lossStartedAt
    if (elapsed <= this.options.trackingLossGraceMs) {
      if (this.pointer) this.pointer = { ...this.pointer, velocity: ZERO_VELOCITY, active: false, tracked: false, stale: true }
      return this.snapshot(timestampMs, [])
    }

    const events = this.endEvents(timestampMs, 'tracking_lost')
    this.releasePrimary()
    return this.snapshot(timestampMs, events)
  }

  private endEvents(timestampMs: number, reason: InteractionEndReason): InteractionEvent[] {
    if (!this.pointer) return []
    const events: InteractionEvent[] = []
    if (this.state === 'dragging' && this.drag) {
      this.drag = { ...this.drag, durationMs: timestampMs - this.pinchStartedAt }
      events.push(this.dragEndEvent(timestampMs, reason))
    }
    if (this.state === 'pinching' || this.state === 'dragging') events.push(this.pinchEndEvent(timestampMs, reason))
    return events
  }

  private releasePrimary(): void {
    this.state = 'idle'
    this.primary = null
    this.pointer = null
    this.drag = null
    this.pinchOrigin = null
    this.lossStartedAt = null
    this.pointerTimestampMs = null
    this.filter.reset()
  }

  private pointerEvent(type: 'pointermove' | 'pinchstart' | 'pinchmove', timestampMs: number): InteractionEvent {
    return { type, timestampMs, position: copyPosition(this.pointer!.position), velocity: { ...this.pointer!.velocity } }
  }

  private pinchEndEvent(timestampMs: number, reason: InteractionEndReason): InteractionEvent {
    return { ...this.pointerEvent('pinchmove', timestampMs), type: 'pinchend', reason }
  }

  private dragEvent(type: 'dragstart' | 'dragmove', timestampMs: number): InteractionEvent {
    return { ...this.pointerEvent('pinchmove', timestampMs), type, drag: this.drag! }
  }

  private dragEndEvent(timestampMs: number, reason: InteractionEndReason): InteractionEvent {
    return { ...this.pointerEvent('pinchmove', timestampMs), type: 'dragend', reason, drag: this.drag! }
  }

  private snapshot(timestampMs: number, events: InteractionEvent[]): InteractionFrame {
    return {
      timestampMs,
      primaryTrackId: this.primary?.trackId ?? null,
      primaryHand: this.primary ? { ...this.primary } : null,
      pointer: this.pointer ? { ...this.pointer, position: { ...this.pointer.position }, velocity: { ...this.pointer.velocity } } : null,
      state: this.state,
      drag: this.drag ? { ...this.drag, startPosition: { ...this.drag.startPosition }, currentPosition: { ...this.drag.currentPosition }, delta: { ...this.drag.delta }, totalDelta: { ...this.drag.totalDelta } } : null,
      events,
    }
  }

  reset(): void {
    this.releasePrimary()
    this.lastTimestampMs = null
    this.lastGeometryKey = null
  }

  dispose(): void {
    if (this.disposed) return
    this.reset()
    this.disposed = true
  }
}
