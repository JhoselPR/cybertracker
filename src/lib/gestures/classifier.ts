import type { Gesture, GestureScores, RawGestureResult } from '../../types/gestures'
import type { NormalizedLandmark, TrackedHand } from '../../types/tracking'
import { GESTURE_THRESHOLDS as T } from './config'
import { extractFingerStates, toFingerStates, type FingerEvidenceMap } from './fingerState'
import { normalizedDistance, smoothstep, type GeometryContext } from './geometry'

const SUPPORTED_GESTURES: Exclude<Gesture, 'unknown'>[] = ['open_palm', 'fist', 'point', 'victory']

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function patternScore(required: readonly number[]): number {
  return 0.55 * Math.min(...required) + 0.45 * average(required)
}

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark): NormalizedLandmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}

function scoresFor(
  landmarks: readonly NormalizedLandmark[],
  fingers: FingerEvidenceMap,
  scale: number,
  context: GeometryContext,
): GestureScores {
  const nonThumb = [fingers.index, fingers.middle, fingers.ring, fingers.pinky]
  const thumbCompatibility = 0.8 + 0.2 * Math.max(fingers.thumb.extended, fingers.thumb.folded)
  const pinchDistance = normalizedDistance(landmarks[4], landmarks[8], scale, context)
  const separation = normalizedDistance(landmarks[8], landmarks[12], scale, context)

  return {
    pinch: 1 - smoothstep(T.pinch.distanceFull, T.pinch.distanceZero, pinchDistance),
    open_palm: patternScore([fingers.thumb.extended, ...nonThumb.map((finger) => finger.extended)]),
    fist: patternScore(nonThumb.map((finger) => finger.folded)) * thumbCompatibility,
    point: patternScore([
      fingers.index.extended,
      fingers.middle.folded,
      fingers.ring.folded,
      fingers.pinky.folded,
    ]) * thumbCompatibility,
    victory: patternScore([
      fingers.index.extended,
      fingers.middle.extended,
      fingers.ring.folded,
      fingers.pinky.folded,
      smoothstep(T.victory.separationZero, T.victory.separationFull, separation),
    ]) * thumbCompatibility,
  }
}

function unknownResult(position: NormalizedLandmark): RawGestureResult {
  return {
    gesture: 'unknown',
    confidence: 0,
    scores: { open_palm: 0, fist: 0, point: 0, pinch: 0, victory: 0 },
    fingers: { thumb: 'ambiguous', index: 'ambiguous', middle: 'ambiguous', ring: 'ambiguous', pinky: 'ambiguous' },
    position,
  }
}

export function classifyGesture(hand: TrackedHand, context: GeometryContext): RawGestureResult {
  const analysis = extractFingerStates(hand.landmarks, hand.handedness, context)
  if (!analysis.valid) return unknownResult(analysis.palm)

  const scores = scoresFor(hand.landmarks, analysis.fingers, analysis.scale, context)
  let gesture: Gesture = 'unknown'
  let confidence = Math.max(...Object.values(scores))

  if (scores.pinch >= T.acceptance.pinch) {
    gesture = 'pinch'
    confidence = scores.pinch
  } else {
    for (const candidate of SUPPORTED_GESTURES) {
      const score = scores[candidate]
      if (score >= T.acceptance[candidate] && (gesture === 'unknown' || score > confidence)) {
        gesture = candidate
        confidence = score
      }
    }
  }

  const position = gesture === 'pinch'
    ? midpoint(hand.landmarks[4], hand.landmarks[8])
    : gesture === 'point' || gesture === 'victory'
      ? { ...hand.landmarks[8] }
      : analysis.palm

  return {
    gesture,
    confidence,
    scores,
    fingers: toFingerStates(analysis.fingers),
    position,
  }
}
