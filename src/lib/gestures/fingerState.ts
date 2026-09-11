import type { FingerName, FingerState, FingerStates } from '../../types/gestures'
import type { Handedness, NormalizedLandmark } from '../../types/tracking'
import { GESTURE_THRESHOLDS as T } from './config'
import {
  handScale,
  isValidHandLandmarks,
  jointAngle,
  normalizedDistance,
  palmCenter,
  smoothstep,
  type GeometryContext,
} from './geometry'

export interface FingerEvidence {
  state: FingerState
  extended: number
  folded: number
}

export type FingerEvidenceMap = Record<FingerName, FingerEvidence>

export interface HandPoseAnalysis {
  valid: boolean
  scale: number
  palm: NormalizedLandmark
  fingers: FingerEvidenceMap
}

const INVALID_EVIDENCE: FingerEvidence = { state: 'ambiguous', extended: 0, folded: 0 }

function stateFromEvidence(extended: number, folded: number): FingerState {
  if (extended >= T.finger.extendedStateMin && extended - folded >= T.finger.stateMargin) return 'extended'
  if (folded >= T.finger.foldedStateMin && folded - extended >= T.finger.stateMargin) return 'folded'
  return 'ambiguous'
}

function evidence(extended: number, folded: number): FingerEvidence {
  return { state: stateFromEvidence(extended, folded), extended, folded }
}

function analyzeFinger(
  landmarks: readonly NormalizedLandmark[],
  indices: readonly [number, number, number, number],
  palm: NormalizedLandmark,
  scale: number,
  context: GeometryContext,
): FingerEvidence {
  const [mcp, pip, dip, tip] = indices
  const proximalAngle = jointAngle(landmarks[mcp], landmarks[pip], landmarks[dip], context)
  const distalAngle = jointAngle(landmarks[pip], landmarks[dip], landmarks[tip], context)
  const reach = normalizedDistance(landmarks[tip], palm, scale, context)
  if (![proximalAngle, distalAngle, reach].every(Number.isFinite)) return INVALID_EVIDENCE

  const proximalStraight = smoothstep(T.finger.extendedAngleStartDeg, T.finger.extendedAngleFullDeg, proximalAngle)
  const distalStraight = smoothstep(T.finger.extendedAngleStartDeg, T.finger.extendedAngleFullDeg, distalAngle)
  const reachExtended = smoothstep(T.nonThumbReach.folded, T.nonThumbReach.extended, reach)
  const bend = 1 - smoothstep(T.finger.foldedAngleStartDeg, T.finger.foldedAngleEndDeg, proximalAngle)
  const distalBend = 1 - smoothstep(T.finger.foldedAngleStartDeg, T.finger.foldedAngleEndDeg, distalAngle)
  const reachFolded = 1 - smoothstep(T.nonThumbReach.folded, T.nonThumbReach.extended, reach)

  return evidence(
    0.45 * proximalStraight + 0.3 * distalStraight + 0.25 * reachExtended,
    0.55 * bend + 0.15 * distalBend + 0.3 * reachFolded,
  )
}

function analyzeThumb(
  landmarks: readonly NormalizedLandmark[],
  palm: NormalizedLandmark,
  scale: number,
  context: GeometryContext,
): FingerEvidence {
  const mcpAngle = jointAngle(landmarks[1], landmarks[2], landmarks[3], context)
  const ipAngle = jointAngle(landmarks[2], landmarks[3], landmarks[4], context)
  const spread = normalizedDistance(landmarks[4], landmarks[5], scale, context)
  const reach = normalizedDistance(landmarks[4], palm, scale, context)
  if (![mcpAngle, ipAngle, spread, reach].every(Number.isFinite)) return INVALID_EVIDENCE

  const straight = (smoothstep(125, 170, mcpAngle) + smoothstep(125, 170, ipAngle)) / 2
  const spreadExtended = smoothstep(T.thumb.spreadFolded, T.thumb.spreadExtended, spread)
  const reachExtended = smoothstep(T.thumb.reachFolded, T.thumb.reachExtended, reach)
  const bent = 1 - smoothstep(90, 155, Math.min(mcpAngle, ipAngle))
  const tucked = 1 - smoothstep(T.thumb.spreadFolded, T.thumb.spreadExtended, spread)
  const closeToPalm = 1 - smoothstep(T.thumb.reachFolded, T.thumb.reachExtended, reach)

  return evidence(
    0.45 * straight + 0.3 * spreadExtended + 0.25 * reachExtended,
    0.4 * bent + 0.35 * tucked + 0.25 * closeToPalm,
  )
}

export function extractFingerStates(
  landmarks: readonly NormalizedLandmark[],
  handedness: Handedness,
  context: GeometryContext,
): HandPoseAnalysis {
  const wrist = landmarks[0]
  const fallbackPalm = wrist && [wrist.x, wrist.y, wrist.z].every(Number.isFinite)
    ? { x: wrist.x, y: wrist.y, z: wrist.z }
    : { x: 0, y: 0, z: 0 }
  if (!isValidHandLandmarks(landmarks)) {
    return {
      valid: false,
      scale: 0,
      palm: fallbackPalm,
      fingers: {
        thumb: INVALID_EVIDENCE,
        index: INVALID_EVIDENCE,
        middle: INVALID_EVIDENCE,
        ring: INVALID_EVIDENCE,
        pinky: INVALID_EVIDENCE,
      },
    }
  }

  const palm = palmCenter(landmarks)
  const scale = handScale(landmarks, context)
  if (!Number.isFinite(scale) || scale <= T.minimumHandScale) {
    return extractFingerStates([], handedness, context)
  }

  return {
    valid: true,
    scale,
    palm,
    fingers: {
      thumb: analyzeThumb(landmarks, palm, scale, context),
      index: analyzeFinger(landmarks, [5, 6, 7, 8], palm, scale, context),
      middle: analyzeFinger(landmarks, [9, 10, 11, 12], palm, scale, context),
      ring: analyzeFinger(landmarks, [13, 14, 15, 16], palm, scale, context),
      pinky: analyzeFinger(landmarks, [17, 18, 19, 20], palm, scale, context),
    },
  }
}

export function toFingerStates(evidenceMap: FingerEvidenceMap): FingerStates {
  return {
    thumb: evidenceMap.thumb.state,
    index: evidenceMap.index.state,
    middle: evidenceMap.middle.state,
    ring: evidenceMap.ring.state,
    pinky: evidenceMap.pinky.state,
  }
}
