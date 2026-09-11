import type { InteractionEngineOptions } from '../../types/interaction'

export const INTERACTION_DEFAULTS: Readonly<InteractionEngineOptions> = {
  minCutoff: 1.2,
  beta: 0.35,
  derivativeCutoff: 1,
  dragThreshold: 0.045,
  trackingLossGraceMs: 180,
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
  for (const key of ['beta', 'dragThreshold', 'trackingLossGraceMs'] as const) {
    if (!Number.isFinite(resolved[key]) || resolved[key] < 0) {
      throw new RangeError(`${key} must be a finite non-negative number`)
    }
  }
  return resolved
}
