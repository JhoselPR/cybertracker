export const DEPTH_CONFIG = Object.freeze({
  historySlots: 48,
  historyAgeMs: 1800,
  minimumBaselineSamples: 8,
  minimumSegmentDistance: 1e-5,
  deadZoneLog: 0.006,
  smoothingTimeConstantSeconds: 0.105,
  maximumWorldZVelocity: 2.4,
  traceSlots: 180,
})

export type DepthConfig = typeof DEPTH_CONFIG
