import type { Position2D, InteractionEndReason, InteractionFrame } from './interaction'
import type { SpatialHandPose, SpatialQuaternion, SpatialVector2, SpatialVector3 } from './spatial'
import type { DepthEstimate, DepthEvidence } from '../lib/spatial-interaction/depth/types'

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

export interface SpatialInteractionInputs {
  interactionFrame: InteractionFrame
  anchorPose: SpatialHandPose | null
  interactionPose?: SpatialHandPose | null
  depthEvidence: DepthEvidence | null
  viewport: { width: number; height: number }
  debugEnabled: boolean
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
  depth: DepthEstimate
  rotation: RotationDebug
}

export interface RotationDebug {
  handRotation: SpatialQuaternion | null
  baselineHandRotation: SpatialQuaternion | null
  deltaRotation: SpatialQuaternion | null
  targetObjectRotation: SpatialQuaternion | null
  appliedObjectRotation: SpatialQuaternion | null
  deltaAngleFromBaseline: number | null
  targetDeltaAngle: number | null
  appliedDeltaAngle: number | null
  remainingAngleToTarget: number | null
  maxAngularStep: number
  rawDeltaMs: number
  effectiveDeltaMs: number
  holdReason: string | null
  inputEvents: readonly string[]
  handQuaternion: SpatialQuaternion | null
  initialHandQuaternion: SpatialQuaternion | null
  objectQuaternion: SpatialQuaternion | null
  deltaAngle: number
  angularVelocity: number
  state: 'valid' | 'held' | 'invalid'
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
