import type { SpatialVector3 } from '../../types/spatial'

export const HOLOGRAM_CAMERA = Object.freeze({
  position: Object.freeze<SpatialVector3>({ x: 0, y: 0, z: 5 }),
  verticalFovDegrees: 42,
  near: 0.1,
  far: 20,
})

export const SPATIAL_INTERACTION_POLICY = Object.freeze({
  targetRadiusScale: 0.82,
  targetExitRadiusScale: 1.15,
  minimumTargetRadius: 0.12,
  minimumCameraDistance: 0.45,
  maximumCameraDistance: 12,
})

export const PALM_HOLOGRAM_TARGET_ID = 'palm-hologram'
