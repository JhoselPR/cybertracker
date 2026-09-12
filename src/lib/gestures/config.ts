import type { Gesture } from '../../types/gestures'
import { HAND_INTERACTION_POLICY } from '../interactionPolicy'

export const GESTURE_THRESHOLDS = {
  finger: {
    extendedAngleStartDeg: 135,
    extendedAngleFullDeg: 170,
    foldedAngleStartDeg: 92,
    foldedAngleEndDeg: 154,
    extendedStateMin: 0.67,
    foldedStateMin: 0.6,
    stateMargin: 0.06,
  },
  nonThumbReach: {
    folded: 0.72,
    extended: 1.28,
  },
  thumb: {
    spreadFolded: 0.48,
    spreadExtended: 1.02,
    reachFolded: 0.56,
    reachExtended: 1.12,
  },
  pinch: {
    distanceFull: 0.2,
    distanceZero: 0.5,
    enterDistance: HAND_INTERACTION_POLICY.pinchEnterThreshold,
    exitDistance: HAND_INTERACTION_POLICY.pinchExitThreshold,
  },
  victory: {
    separationZero: 0.3,
    separationFull: 0.72,
  },
  acceptance: {
    pinch: 0.72,
    open_palm: 0.72,
    fist: 0.7,
    point: 0.72,
    victory: 0.7,
  } satisfies Record<Exclude<Gesture, 'unknown'>, number>,
  minimumHandScale: 1e-5,
} as const

export const STABILIZATION_POLICY = {
  initialDwellMs: 120,
  transitionDwellMs: 170,
  unknownGraceMs: 180,
  trackExpiryMs: 650,
  maximumMatchDistance: 1.35,
  handednessMismatchPenalty: 0.2,
  confidenceSmoothing: 0.35,
} as const
