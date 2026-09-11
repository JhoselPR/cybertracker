import type { NormalizedLandmark, TrackedHand } from './tracking'

export type Gesture = 'open_palm' | 'fist' | 'point' | 'pinch' | 'victory' | 'unknown'

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
export type FingerState = 'extended' | 'folded' | 'ambiguous'
export type FingerStates = Record<FingerName, FingerState>

export type GestureScores = Record<Exclude<Gesture, 'unknown'>, number>

export interface RawGestureResult {
  gesture: Gesture
  confidence: number
  scores: GestureScores
  fingers: FingerStates
  /** Raw, unmirrored normalized source coordinates. */
  position: NormalizedLandmark
}

export interface StableGestureResult {
  gesture: Gesture
  confidence: number
  /** Raw, unmirrored normalized source coordinates from the current frame. */
  position: NormalizedLandmark
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
