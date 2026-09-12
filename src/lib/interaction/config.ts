import type { InteractionEngineOptions } from '../../types/interaction'
import { HAND_INTERACTION_POLICY } from '../interactionPolicy'

export const INTERACTION_DEFAULTS: Readonly<InteractionEngineOptions> = {
  minCutoff: 1.2,
  beta: 0.35,
  derivativeCutoff: 1,
  dragThreshold: HAND_INTERACTION_POLICY.dragStartDistance,
  trackingLossGraceMs: HAND_INTERACTION_POLICY.idleTrackingLossGraceMs,
  interactionGraceMs: HAND_INTERACTION_POLICY.interactionGraceMs,
}

export function resolveInteractionOptions(
  options: Partial<InteractionEngineOptions> = {},
): InteractionEngineOptions {
  const resolved = { ...INTERACTION_DEFAULTS, ...options }
  for (const key of ['minCutoff', 'derivativeCutoff'] as const) {
    if (!Number.isFinite(resolved[key]) || resolved[key] <= 0) {
      throw new RangeError(`${key} must be a finite positive number`)
    }
  }
  for (const key of ['beta', 'dragThreshold', 'trackingLossGraceMs', 'interactionGraceMs'] as const) {
    if (!Number.isFinite(resolved[key]) || resolved[key] < 0) {
      throw new RangeError(`${key} must be a finite non-negative number`)
    }
  }
  return resolved
}
