/** Shared physical-hand interaction policy. Values use normalized viewport units or CSS pixels as named. */
export const HAND_INTERACTION_POLICY = Object.freeze({
  pinchEnterThreshold: 0.30,
  pinchExitThreshold: 0.42,
  idleTrackingLossGraceMs: 180,
  interactionGraceMs: 320,
  dragStartDistance: 0.018,
  selectionSlop: 0.035,
  spatialHitPadding: 14,
  headerHitPadding: 18,
  controlHitPadding: 10,
  hoverIntentMs: 55,
  hoverExitPadding: 8,
  hoverExitGraceMs: 80,
  transitionHistoryLimit: 8,
})

export function validateHandInteractionPolicy(
  policy: { [Key in keyof typeof HAND_INTERACTION_POLICY]: number } = HAND_INTERACTION_POLICY,
): void {
  if (policy.pinchExitThreshold <= policy.pinchEnterThreshold) {
    throw new RangeError('pinchExitThreshold must be greater than pinchEnterThreshold')
  }
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite non-negative number`)
  }
}

validateHandInteractionPolicy()
