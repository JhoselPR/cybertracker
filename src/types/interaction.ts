import type { Handedness } from './tracking'

export interface Position2D {
  /** Normalized viewport coordinate in the inclusive range [0, 1]. */
  x: number
  /** Normalized viewport coordinate in the inclusive range [0, 1]. */
  y: number
}

export interface Velocity2D {
  /** Normalized viewport units per second. */
  x: number
  /** Normalized viewport units per second. */
  y: number
  /** Euclidean speed in normalized viewport units per second. */
  magnitude: number
}

export interface VirtualPointer {
  position: Position2D
  velocity: Velocity2D
  /** True while point, pinch, or drag intent is active and tracking is current. */
  active: boolean
  /** True when the primary hand supplied a valid index tip in this frame. */
  tracked: boolean
  /** True while a previously tracked primary is inside the loss grace period. */
  stale: boolean
}

export type InteractionState = 'idle' | 'pointing' | 'pinching' | 'dragging'
export type InteractionEndReason = 'released' | 'tracking_lost' | 'primary_changed' | 'geometry_changed'

export interface PrimaryHand {
  trackId: number
  handedness: Handedness
}

export interface DragSnapshot {
  startPosition: Position2D
  currentPosition: Position2D
  delta: Position2D
  totalDelta: Position2D
  distance: number
  pathLength: number
  durationMs: number
}

interface PointerEventBase {
  timestampMs: number
  position: Position2D
  velocity: Velocity2D
}

export interface PointerMoveEvent extends PointerEventBase {
  type: 'pointermove'
}

export interface PinchStartEvent extends PointerEventBase {
  type: 'pinchstart'
}

export interface PinchMoveEvent extends PointerEventBase {
  type: 'pinchmove'
}

export interface PinchEndEvent extends PointerEventBase {
  type: 'pinchend'
  reason: InteractionEndReason
}

export interface DragStartEvent extends PointerEventBase {
  type: 'dragstart'
  drag: DragSnapshot
}

export interface DragMoveEvent extends PointerEventBase {
  type: 'dragmove'
  drag: DragSnapshot
}

export interface DragEndEvent extends PointerEventBase {
  type: 'dragend'
  reason: InteractionEndReason
  drag: DragSnapshot
}

export type InteractionEvent =
  | PointerMoveEvent
  | PinchStartEvent
  | PinchMoveEvent
  | PinchEndEvent
  | DragStartEvent
  | DragMoveEvent
  | DragEndEvent

export interface InteractionFrame {
  timestampMs: number
  primaryTrackId: number | null
  primaryHand: PrimaryHand | null
  pointer: VirtualPointer | null
  state: InteractionState
  drag: DragSnapshot | null
  events: InteractionEvent[]
}

export interface InteractionContext {
  sourceWidth: number
  sourceHeight: number
  viewportWidth: number
  viewportHeight: number
  mirrorX: boolean
}

export interface InteractionEngineOptions {
  minCutoff: number
  beta: number
  derivativeCutoff: number
  dragThreshold: number
  trackingLossGraceMs: number
}
