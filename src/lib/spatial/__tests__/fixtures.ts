import type { EnrichedHand, EnrichedTrackingFrame } from '../../../types/gestures'
import type { Handedness } from '../../../types/tracking'
import { makeHand, rawGesture } from '../../gestures/__tests__/fixtures'

export function spatialHand(
  trackId = 1,
  confidence = 0.9,
  handedness: Handedness = 'Right',
  transform: Parameters<typeof makeHand>[1] = {},
): EnrichedHand {
  const hand = makeHand('open_palm', transform, handedness)
  const gesture = rawGesture('open_palm', confidence)
  return { ...hand, trackId, rawGesture: gesture, stableGesture: gesture }
}

export const spatialFrame = (timestampMs: number, hands: EnrichedHand[]): EnrichedTrackingFrame => ({
  timestampMs,
  hands,
})

export const projectionContext = {
  sourceWidth: 1000,
  sourceHeight: 1000,
  viewportWidth: 1000,
  viewportHeight: 1000,
  mirrorX: false,
}
