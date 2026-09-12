import type { Handedness } from './tracking'

export interface SpatialVector2 {
  x: number
  y: number
}

export interface SpatialVector3 {
  x: number
  y: number
  z: number
}

export interface SpatialQuaternion {
  x: number
  y: number
  z: number
  w: number
}

export interface SpatialBasis {
  x: SpatialVector3
  y: SpatialVector3
  z: SpatialVector3
}

/** Framework-neutral palm pose in mirrored display and right-handed Three coordinates. */
export interface SpatialHandPose {
  timestampMs: number
  trackId: number
  handedness: Handedness
  confidence: number
  /** Palm center after source-to-cover projection, normalized to the viewport. */
  center: SpatialVector2
  /** The same center in WebGL normalized device coordinates. */
  anchor: SpatialVector3
  /** Apparent palm size relative to the viewport's shorter dimension. */
  scale: number
  normal: SpatialVector3
  basis: SpatialBasis
  quaternion: SpatialQuaternion
}
