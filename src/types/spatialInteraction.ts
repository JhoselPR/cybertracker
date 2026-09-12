import type { Position2D, InteractionEndReason, InteractionFrame } from './interaction'
import type { SpatialHandPose, SpatialQuaternion, SpatialVector2, SpatialVector3 } from './spatial'

export type HologramOwnershipMode = 'palm-anchored' | 'grabbed' | 'free'
export type SpatialInteractionState = 'idle' | 'hovering' | 'grabbed'
export type SpatialCursorState = 'normal' | 'spatial-hover' | 'spatial-grabbed'

export interface SpatialRay {
  origin: SpatialVector3
  direction: SpatialVector3
}

export interface SpatialTransform {
  position: SpatialVector3
  quaternion: SpatialQuaternion
  scale: number
}

export interface SpatialHandMetric {
  trackId: number
  apparentPalmScale: number
}

export interface SpatialInteractionInputs {
  interactionFrame: InteractionFrame
  anchorPose: SpatialHandPose | null
  interactionMetric: SpatialHandMetric | null
  viewport: { width: number; height: number }
}

interface SpatialEventBase {
  targetId: string
  position: SpatialVector3
  timestampMs: number
  trackId: number | null
  pointer?: Position2D
  ray?: SpatialRay
}

export type SpatialInteractionEvent =
  | (SpatialEventBase & { type: 'spatialenter' | 'spatialleave' | 'grabstart' | 'grabend' })
  | (SpatialEventBase & { type: 'grabmove'; depthRatio: number })
  | (SpatialEventBase & { type: 'grabcancel'; reason: InteractionEndReason })

export interface SpatialInteractionDebug {
  targetId: string | null
  ray: SpatialRay | null
  grabOffset: SpatialVector2 | null
  depthRatio: number
  grabDurationMs: number
  lastEvent: SpatialInteractionEvent['type'] | null
}

export interface HologramSemanticState {
  targetId: string
  timestampMs: number
  mode: HologramOwnershipMode
  interactionState: SpatialInteractionState
  transform: SpatialTransform | null
  anchorTrackId: number | null
  interactionTrackId: number | null
  hovered: boolean
  grabbed: boolean
  visible: boolean
  opacity: number
  cursorState: SpatialCursorState
  events: readonly SpatialInteractionEvent[]
  debug: SpatialInteractionDebug
}
