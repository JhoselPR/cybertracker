import type { EnrichedHand } from '../../types/gestures'

function hasValidIndexTip(hand: EnrichedHand): boolean {
  const tip = hand.landmarks[8]
  return Boolean(tip && Number.isFinite(tip.x) && Number.isFinite(tip.y))
}

function isInteractive(hand: EnrichedHand): boolean {
  return hand.stableGesture.gesture === 'point' || hand.stableGesture.gesture === 'pinch'
}

/** Interactive gestures rank first; non-interactive hands provide the visual-pointer fallback. */
export function selectPrimaryHand(hands: readonly EnrichedHand[]): EnrichedHand | null {
  const candidates = hands.filter(hasValidIndexTip)
  candidates.sort((a, b) => {
    const intentRank = Number(isInteractive(b)) - Number(isInteractive(a))
    if (intentRank !== 0) return intentRank
    const confidenceRank = b.stableGesture.confidence - a.stableGesture.confidence
    return confidenceRank !== 0 ? confidenceRank : a.trackId - b.trackId
  })
  return candidates[0] ?? null
}

export function findPrimaryHand(hands: readonly EnrichedHand[], trackId: number): EnrichedHand | null {
  return hands.find((hand) => hand.trackId === trackId && hasValidIndexTip(hand)) ?? null
}
