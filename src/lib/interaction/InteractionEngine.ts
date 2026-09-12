import { projectSourceToViewport } from '../coordinates'
import type { EnrichedHand, EnrichedTrackingFrame, Gesture, PinchEvidence } from '../../types/gestures'
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
import { intentForGesture, transitionInteractionState, type InteractionIntent } from './stateMachine'

const ZERO_VELOCITY: Velocity2D = { x: 0, y: 0, magnitude: 0 }

const clamp = (value: number): number => Math.max(0, Math.min(1, value))
const copyPosition = (position: Position2D): Position2D => ({ x: position.x, y: position.y })
const validAnchor = (anchor: EnrichedHand['rawGesture']['anchors']['aim']): anchor is NonNullable<typeof anchor> => Boolean(
  anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y),
)

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
  private gapStartedAt: number | null = null
  private pointerTimestampMs: number | null = null
  private lastTimestampMs: number | null = null
  private lastGeometryKey: string | null = null
  private pinchOffset: Position2D | null = null
  private rawGesture: Gesture | null = null
  private stableGesture: Gesture | null = null
  private pinchEvidence: PinchEvidence | null = null
  private lastTransition: string | null = null
  private terminationReason: InteractionEndReason | null = null
  private disposed = false

  constructor(options: Partial<InteractionEngineOptions> = {}) {
    this.options = resolveInteractionOptions(options)
    this.filter = new PointerFilter(this.options)
  }

  processFrame(frame: EnrichedTrackingFrame, context: InteractionContext): InteractionFrame {
    if (this.disposed) throw new Error('InteractionEngine has been disposed')
    const timestampMs = frame.timestampMs
    if (!Number.isFinite(timestampMs)) throw new RangeError('timestampMs must be finite')
    if (this.lastTimestampMs !== null && timestampMs < this.lastTimestampMs) throw new RangeError('timestampMs must not decrease')
    projectSourceToViewport({ x: 0, y: 0 }, context.sourceWidth, context.sourceHeight,
      context.viewportWidth, context.viewportHeight, context.mirrorX)
    if (this.lastTimestampMs === timestampMs) return this.snapshot(timestampMs, [])

    const nextGeometryKey = geometryKey(context)
    const geometryChanged = this.lastGeometryKey !== null && this.lastGeometryKey !== nextGeometryKey
    this.lastGeometryKey = nextGeometryKey
    this.lastTimestampMs = timestampMs
    if (geometryChanged) {
      this.filter.reset()
      this.pointerTimestampMs = null
      this.pinchOffset = null
    }

    let hand = this.primary ? findPrimaryHand(frame.hands, this.primary.trackId) : null
    if (!this.primary) {
      hand = selectPrimaryHand(frame.hands)
      if (hand) this.acquire(hand)
    }
    if (!hand) return this.handleGap(timestampMs, 'tracking_lost')

    this.primary!.handedness = hand.handedness
    this.rawGesture = hand.rawGesture.gesture
    this.stableGesture = hand.stableGesture.gesture
    this.pinchEvidence = { ...hand.rawGesture.pinchEvidence }

    const activePinch = this.state === 'pinching' || this.state === 'dragging'
    const phase = hand.rawGesture.pinchEvidence.phase
    if (activePinch && (phase === 'ambiguous' || phase === 'unavailable')) {
      return this.handleGap(timestampMs, 'gesture_ambiguous')
    }

    if (this.gapStartedAt !== null) {
      this.gapStartedAt = null
      this.lastTransition = 'grace_recovered'
    }

    let intent: InteractionIntent = intentForGesture(hand.stableGesture.gesture)
    if (activePinch && phase === 'closed') intent = 'pinching'
    if (activePinch && phase === 'open') {
      intent = hand.rawGesture.gesture === 'point' ? 'pointing' : 'idle'
    }
    if (!activePinch && intent === 'pinching' && phase !== 'closed') intent = 'idle'

    const usePinchAnchor = intent === 'pinching'
    const anchor = usePinchAnchor ? hand.rawGesture.anchors.pinch : hand.rawGesture.anchors.aim
    if (!validAnchor(anchor)) return this.handleGap(timestampMs, activePinch ? 'gesture_ambiguous' : 'tracking_lost')

    const projected = projectSourceToViewport(
      { x: anchor.x, y: anchor.y },
      context.sourceWidth,
      context.sourceHeight,
      context.viewportWidth,
      context.viewportHeight,
      context.mirrorX,
    )
    if (usePinchAnchor && !this.pinchOffset) {
      this.pinchOffset = this.pointer
        ? { x: this.pointer.position.x - projected.x, y: this.pointer.position.y - projected.y }
        : { x: 0, y: 0 }
    } else if (!usePinchAnchor) {
      this.pinchOffset = null
    }
    const adjusted = this.pinchOffset
      ? { x: projected.x + this.pinchOffset.x, y: projected.y + this.pinchOffset.y }
      : projected
    const filtered = this.filter.filter(adjusted, timestampMs)
    const position = { x: clamp(filtered.x), y: clamp(filtered.y) }
    const previousPosition = this.pointer?.position ?? position
    const dt = this.pointer && this.pointerTimestampMs !== null ? (timestampMs - this.pointerTimestampMs) / 1000 : 0
    const velocity = dt > 0 ? {
      x: (position.x - previousPosition.x) / dt,
      y: (position.y - previousPosition.y) / dt,
      magnitude: Math.hypot(position.x - previousPosition.x, position.y - previousPosition.y) / dt,
    } : ZERO_VELOCITY
    const changed = position.x !== previousPosition.x || position.y !== previousPosition.y
    this.pointer = {
      position,
      velocity,
      active: false,
      tracked: true,
      stale: false,
      anchorSource: usePinchAnchor ? 'pinch' : 'aim',
      quality: 'tracked',
    }
    this.pointerTimestampMs = timestampMs

    if (geometryChanged && this.pinchOrigin) {
      this.pinchOrigin = copyPosition(position)
      this.pinchStartedAt = timestampMs
      this.drag = dragSnapshot(position, position, position, 0, timestampMs, timestampMs)
    }

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
      this.terminationReason = null
      this.lastTransition = 'pinchstart'
      events.push(this.pointerEvent('pinchstart', timestampMs))
    }
    if (transition.pinchMoved && !geometryChanged) events.push(this.pointerEvent('pinchmove', timestampMs))
    if (this.pinchOrigin && (transition.dragStarted || transition.dragMoved || transition.dragEnded)) {
      const previousDragPosition = this.drag?.currentPosition ?? this.pinchOrigin
      this.drag = dragSnapshot(this.pinchOrigin, previousDragPosition, position, this.drag?.pathLength ?? 0,
        this.pinchStartedAt, timestampMs)
    }
    if (transition.dragStarted) {
      this.lastTransition = 'dragstart'
      events.push(this.dragEvent('dragstart', timestampMs))
    }
    if (transition.dragMoved && !geometryChanged) events.push(this.dragEvent('dragmove', timestampMs))
    if (transition.dragEnded) events.push(this.dragEndEvent(timestampMs, 'released'))
    if (transition.pinchEnded) {
      events.push(this.pinchEndEvent(timestampMs, 'released'))
      this.lastTransition = 'pinchend'
      this.terminationReason = 'released'
    }

    this.state = transition.next
    this.pointer.active = this.state !== 'idle'
    if (transition.pinchEnded) {
      this.pinchOrigin = null
      this.drag = null
      this.pinchOffset = null
    }
    return this.snapshot(timestampMs, events)
  }

  private acquire(hand: EnrichedHand): void {
    this.primary = { trackId: hand.trackId, handedness: hand.handedness }
    this.filter.reset()
    this.pointer = null
    this.pointerTimestampMs = null
    this.gapStartedAt = null
  }

  private handleGap(timestampMs: number, reason: 'gesture_ambiguous' | 'tracking_lost'): InteractionFrame {
    if (!this.primary) return this.snapshot(timestampMs, [])
    this.gapStartedAt ??= timestampMs
    const active = this.state === 'pinching' || this.state === 'dragging'
    const graceMs = active ? this.options.interactionGraceMs : this.options.trackingLossGraceMs
    if (timestampMs - this.gapStartedAt <= graceMs) {
      if (this.pointer) this.pointer = {
        ...this.pointer,
        velocity: ZERO_VELOCITY,
        active,
        tracked: false,
        stale: true,
        anchorSource: 'retained',
        quality: active ? 'grace' : 'stale',
      }
      this.lastTransition = active ? 'grace_started' : this.lastTransition
      return this.snapshot(timestampMs, [])
    }

    const events = this.endEvents(timestampMs, reason)
    this.lastTransition = active ? 'cancelled' : 'tracking_lost'
    this.terminationReason = reason
    this.clearInteraction()
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

  private clearInteraction(): void {
    this.state = 'idle'
    this.primary = null
    this.pointer = null
    this.drag = null
    this.pinchOrigin = null
    this.pinchOffset = null
    this.gapStartedAt = null
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
      rawGesture: this.rawGesture,
      stableGesture: this.stableGesture,
      pinchEvidence: this.pinchEvidence ? { ...this.pinchEvidence } : null,
      lastTransition: this.lastTransition,
      terminationReason: this.terminationReason,
    }
  }

  reset(): void {
    this.clearInteraction()
    this.lastTimestampMs = null
    this.lastGeometryKey = null
    this.rawGesture = null
    this.stableGesture = null
    this.pinchEvidence = null
    this.lastTransition = null
    this.terminationReason = null
  }

  dispose(): void {
    if (this.disposed) return
    this.reset()
    this.disposed = true
  }
}
