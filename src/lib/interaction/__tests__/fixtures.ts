import type { EnrichedHand, EnrichedTrackingFrame, Gesture, PinchEvidencePhase } from '../../../types/gestures'
import type { Handedness, NormalizedLandmark } from '../../../types/tracking'

export const TEST_CONTEXT = {
  sourceWidth: 100,
  sourceHeight: 100,
  viewportWidth: 100,
  viewportHeight: 100,
  mirrorX: false,
}

export function interactionHand(
  trackId: number,
  gesture: Gesture,
  x = 0.5,
  y = 0.5,
  confidence = 0.9,
  handedness: Handedness = 'Unknown',
  pinchPhase: PinchEvidencePhase = gesture === 'pinch' ? 'closed' : 'open',
): EnrichedHand {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  landmarks[8] = { x, y, z: 0 }
  landmarks[4] = { x, y, z: 0 }
  const aim = { x, y, z: 0 }
  const pinch = { x, y, z: 0 }
  const pinchEvidence = { phase: pinchPhase, normalizedDistance: pinchPhase === 'unavailable' ? null : pinchPhase === 'closed' ? 0.2 : pinchPhase === 'open' ? 0.5 : 0.36 }
  const scores = { open_palm: 0, fist: 0, point: 0, pinch: 0, victory: 0 }
  return {
    trackId,
    landmarks,
    handedness,
    confidence: 0.95,
    rawGesture: {
      gesture,
      confidence,
      scores,
      fingers: { thumb: 'ambiguous', index: 'ambiguous', middle: 'ambiguous', ring: 'ambiguous', pinky: 'ambiguous' },
      position: { x, y, z: 0 },
      anchors: { aim, pinch },
      pinchEvidence,
    },
    stableGesture: { gesture, confidence, position: { x, y, z: 0 }, anchors: { aim, pinch }, pinchEvidence },
  }
}

export function interactionFrame(timestampMs: number, ...hands: EnrichedHand[]): EnrichedTrackingFrame {
  return { timestampMs, hands }
}
