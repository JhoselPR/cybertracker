import { GESTURE_THRESHOLDS } from '../gestures/config'

export const SPATIAL_POSE_POLICY = Object.freeze({
  openPalmConfidence: GESTURE_THRESHOLDS.acceptance.open_palm,
  minimumScale: 0.045,
  maximumScale: 0.55,
  orientationFallbackMs: 80,
  resetGapMs: 250,
  positionTimeConstantMs: 62,
  scaleTimeConstantMs: 105,
  orientationTimeConstantMs: 82,
  appearanceDwellMs: 80,
  disappearanceGraceMs: 120,
  fadeMs: 140,
  hoverScaleRatio: 0.18,
})
