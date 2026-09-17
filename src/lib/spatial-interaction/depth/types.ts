export type DepthDistances = readonly [number, number, number, number, number, number, number, number]

export interface DepthEvidence {
  trackId: number
  timestampMs: number
  projectionId: number
  /** 0-5, 0-9, 0-13, 0-17, 5-9, 9-13, 13-17, 5-17. */
  distances: DepthDistances
  /** One bit per distance, in the order documented above. */
  validMask: number
  /** Source-polarity palm Z normalized to viewport scale; never world units. */
  palmZ: number | null
  /** Mean available landmark visibility. Absence is neutral. */
  visibility: number | null
}

export interface DepthEstimate {
  timestampMs: number
  /** Current projected palm size in viewport-normalized units. */
  rawPalmScale: number
  /** Fixed projected palm size captured from pre-grab history. */
  baselinePalmScale: number
  /** Raw current-to-baseline projected palm-size ratio. */
  scaleRatio: number
  /** Ratio after the sole 105 ms exponential smoother. */
  filteredScaleRatio: number
  /** Unclamped filtered scale ratio used by world-space mapping (dimensionless). */
  relativeDepth: number
  /** Estimator derivative in natural-log ratio units/second; not world velocity. */
  velocity: number
  trackingValid: boolean
}

export interface DepthTraceEntry {
  timestampMs: number
  rawPalmScale: number
  baselinePalmScale: number
  scaleRatio: number
  filteredScaleRatio: number
  relativeDepth: number
  /** Applied position in world units; null until recorded by the engine. */
  worldZ: number | null
  /** Applied world Z delta/frame duration, in world units/second; zero on hold. */
  velocity: number
  trackingValid: boolean
}
