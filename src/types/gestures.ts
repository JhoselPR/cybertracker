import type { NormalizedLandmark, TrackedHand } from './tracking'

export type Gesture = 'open_palm' | 'fist' | 'point' | 'pinch' | 'victory' | 'unknown'

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
export type FingerState = 'extended' | 'folded' | 'ambiguous'
export type FingerStates = Record<FingerName, FingerState>

export type GestureScores = Record<Exclude<Gesture, 'unknown'>, number>

export type PinchEvidencePhase = 'closed' | 'ambiguous' | 'open' | 'unavailable'

export interface GestureAnchors {
  /** Index-tip aiming anchor in raw, unmirrored source coordinates. */
  aim: NormalizedLandmark | null
  /** Thumb/index midpoint in raw, unmirrored source coordinates. */
  pinch: NormalizedLandmark | null
}

export interface PinchEvidence {
  phase: PinchEvidencePhase
  /** Thumb/index distance normalized by palm scale, when measurable. */
  normalizedDistance: number | null
}

export interface RawGestureResult {
  gesture: Gesture
  confidence: number
  scores: GestureScores
  fingers: FingerStates
  /** Raw, unmirrored normalized source coordinates. */
  position: NormalizedLandmark
  anchors: GestureAnchors
  pinchEvidence: PinchEvidence
}

export interface StableGestureResult {
  gesture: Gesture
  confidence: number
  /** Raw, unmirrored normalized source coordinates from the current frame. */
  position: NormalizedLandmark
  anchors: GestureAnchors
  pinchEvidence: PinchEvidence
}

export interface EnrichedHand extends TrackedHand {
  trackId: number
  rawGesture: RawGestureResult
  stableGesture: StableGestureResult
}

export interface EnrichedTrackingFrame {
  hands: EnrichedHand[]
  timestampMs: number
}
