import { describe, expect, it } from 'vitest'
import { DepthEstimator } from '../DepthEstimator'
import { DepthTraceBuffer } from '../DepthTraceBuffer'
import { apparentPalmScale, APPARENT_SCALE_MASK } from '../depthSignals'
import type { DepthEvidence } from '../types'

const BASE = [0.18, 0.28, 0.34, 0.4, 0.11, 0.12, 0.13, 0.31] as const

function evidence(
  timestampMs: number,
  scale = 1,
  options: Partial<Pick<DepthEvidence, 'trackId' | 'projectionId' | 'validMask' | 'palmZ' | 'visibility'>> & {
    mutate?: (distances: number[]) => void
  } = {},
): DepthEvidence {
  const distances = BASE.map((value) => value * scale)
  options.mutate?.(distances)
  return {
    trackId: options.trackId ?? 7,
    timestampMs,
    projectionId: options.projectionId ?? 11,
    distances: distances as unknown as DepthEvidence['distances'],
    validMask: options.validMask ?? APPARENT_SCALE_MASK,
    palmZ: options.palmZ ?? null,
    visibility: options.visibility ?? null,
  }
}

function seed(estimator: DepthEstimator, scale = 1, start = 0): number {
  for (let i = 0; i < 8; i += 1) estimator.observe(evidence(start + i * 16, scale))
  return start + 128
}

function begin(estimator: DepthEstimator, scale = 1): number {
  const time = seed(estimator, scale)
  expect(estimator.beginGrab(7, time, 11).trackingValid).toBe(true)
  return time
}

describe('DepthEstimator apparent-scale control', () => {
  it('reuses recent valid history for an immediate second grab without an admission delay', () => {
    const estimator = new DepthEstimator()
    const time = begin(estimator)
    const baseline = estimator.current().baselinePalmScale
    estimator.observe(evidence(time + 16, 1.2))
    expect(estimator.current().baselinePalmScale).toBe(baseline)
    estimator.endGrab()
    const second = estimator.beginGrab(7, time + 32, 11)
    expect(second.trackingValid).toBe(true)
    expect(second.baselinePalmScale).toBe(baseline)
    expect(second.relativeDepth).toBe(1)
    estimator.observe(evidence(time + 48, 1.1))
    expect(estimator.current().relativeDepth).toBeGreaterThan(1)
  })

  it('moves relative depth monotonically down for decreasing scale ratios', () => {
    const estimator = new DepthEstimator()
    const time = begin(estimator)
    let previous = 1
    for (let i = 1; i <= 16; i += 1) {
      estimator.observe(evidence(time + i * 16, 1 - i * 0.012))
      expect(estimator.current().relativeDepth).toBeLessThanOrEqual(previous)
      previous = estimator.current().relativeDepth
    }
    expect(previous).toBeLessThan(1)
    expect(estimator.current().trackingValid).toBe(true)
  })

  it('moves relative depth monotonically up for increasing scale ratios', () => {
    const estimator = new DepthEstimator()
    const time = begin(estimator)
    let previous = 1
    for (let i = 1; i <= 16; i += 1) {
      estimator.observe(evidence(time + i * 16, 1 + i * 0.012))
      expect(estimator.current().relativeDepth).toBeGreaterThanOrEqual(previous)
      previous = estimator.current().relativeDepth
    }
    expect(previous).toBeGreaterThan(1)
    expect(estimator.current().trackingValid).toBe(true)
  })

  it('uses exactly the geometric mean of projected 0-9 and 5-17 distances', () => {
    const distances = [...BASE] as unknown as DepthEvidence['distances']
    expect(apparentPalmScale(distances, APPARENT_SCALE_MASK, 1e-5)).toBeCloseTo(Math.sqrt(BASE[1] * BASE[7]), 12)
  })

  it('does not let geometry, temporal, confidence, visibility, or Z diagnostics freeze valid scale', () => {
    const estimator = new DepthEstimator()
    const time = begin(estimator)
    estimator.observe(evidence(time + 16, 1.18, {
      palmZ: Number.POSITIVE_INFINITY,
      visibility: 0,
      mutate: (distances) => {
        distances[0] = 100
        distances[2] = 0.00001
        distances[3] = Number.NaN
        distances[4] = 50
        distances[5] = 0
        distances[6] = Number.POSITIVE_INFINITY
      },
    }))
    const result = estimator.current()
    expect(result.trackingValid).toBe(true)
    expect(result.scaleRatio).toBeCloseTo(1.18, 12)
    expect(result.relativeDepth).toBeGreaterThan(1)
  })

  it('ignores pinch-sensitive internal segments', () => {
    const normal = new DepthEstimator()
    const changed = new DepthEstimator()
    const time = begin(normal)
    begin(changed)
    normal.observe(evidence(time + 16, 1.1))
    changed.observe(evidence(time + 16, 1.1, {
      mutate: (distances) => {
        distances[4] *= 0.01
        distances[5] *= 40
        distances[6] = Number.NaN
      },
    }))
    expect(changed.current().relativeDepth).toBeCloseTo(normal.current().relativeDepth, 12)
    expect(changed.current().scaleRatio).toBeCloseTo(normal.current().scaleRatio, 12)
  })

  it('accepts coherent large movement immediately instead of classifying it as an outlier', () => {
    const estimator = new DepthEstimator()
    const time = begin(estimator)
    estimator.observe(evidence(time + 16, 1.4))
    expect(estimator.current().trackingValid).toBe(true)
    expect(estimator.current().scaleRatio).toBeCloseTo(1.4, 12)
    expect(estimator.current().relativeDepth).toBeGreaterThan(1)
  })

  it('captures a fixed fresh baseline for each grab and retains useful release history', () => {
    const estimator = new DepthEstimator()
    const firstTime = seed(estimator)
    const first = estimator.beginGrab(7, firstTime, 11)
    estimator.observe(evidence(firstTime + 16, 1.5))
    estimator.endGrab()

    const secondTime = seed(estimator, 1.1, 2000)
    const second = estimator.beginGrab(7, secondTime, 11)
    expect(first.baselinePalmScale).toBeCloseTo(Math.sqrt(BASE[1] * BASE[7]), 12)
    expect(second.baselinePalmScale / first.baselinePalmScale).toBeCloseTo(1.1, 12)
    expect(second.scaleRatio).toBe(1)
    estimator.observe(evidence(secondTime + 16, 1.21))
    expect(estimator.current().baselinePalmScale).toBe(second.baselinePalmScale)
    expect(estimator.current().scaleRatio).toBeCloseTo(1.1, 12)
  })

  it('holds through tracking loss and resumes on the first valid signal through the same smoother', () => {
    const estimator = new DepthEstimator()
    const time = begin(estimator)
    estimator.observe(evidence(time + 16, 1.1))
    estimator.observe(null)
    const held = estimator.current().relativeDepth
    expect(estimator.current().trackingValid).toBe(false)
    estimator.observe(evidence(time + 32, 1.2))
    expect(estimator.current().trackingValid).toBe(true)
    expect(estimator.current().relativeDepth).toBeGreaterThan(held)
  })

  it('holds safely for missing scale, NaN, and Infinity and recovers with finite output', () => {
    const estimator = new DepthEstimator()
    const time = begin(estimator)
    for (const [offset, invalid] of [[16, Number.NaN], [32, Number.POSITIVE_INFINITY]] as const) {
      estimator.observe(evidence(time + offset, 1, { mutate: (distances) => { distances[1] = invalid } }))
      expect(estimator.current().trackingValid).toBe(false)
      expect(Number.isFinite(estimator.current().relativeDepth)).toBe(true)
    }
    estimator.observe(evidence(time + 48, 1.1))
    expect(estimator.current().trackingValid).toBe(true)
    expect(Number.isFinite(estimator.current().relativeDepth)).toBe(true)
  })

  it('holds on absent baseline and identity, projection, or timestamp failure', () => {
    const estimator = new DepthEstimator()
    estimator.observe(evidence(0))
    expect(estimator.beginGrab(7, 16, 11).trackingValid).toBe(false)

    const tracked = new DepthEstimator()
    const time = begin(tracked)
    tracked.observe(evidence(time, 1.1))
    expect(tracked.current().trackingValid).toBe(false)
    tracked.observe(evidence(time + 16, 1.1, { projectionId: 12 }))
    expect(tracked.current().trackingValid).toBe(false)
  })

  it('keeps the fixed log dead zone centered at the grab baseline', () => {
    const estimator = new DepthEstimator()
    const time = begin(estimator)
    estimator.observe(evidence(time + 16, Math.exp(0.005)))
    expect(estimator.current().relativeDepth).toBe(1)
    estimator.observe(evidence(time + 32, Math.exp(0.008)))
    expect(estimator.current().relativeDepth).toBeGreaterThan(1)
  })
})

describe('DepthTraceBuffer', () => {
  const estimate = {
    timestampMs: 0, rawPalmScale: 0.2, baselinePalmScale: 0.2, scaleRatio: 1,
    filteredScaleRatio: 1, relativeDepth: 1, velocity: 0, trackingValid: true,
  }

  it('exports wrapped entries in chronological order', () => {
    const trace = new DepthTraceBuffer(true, 3)
    for (let timestamp = 1; timestamp <= 5; timestamp += 1) trace.push({ ...estimate, timestampMs: timestamp })
    expect(trace.export().map(({ timestampMs }) => timestampMs)).toEqual([3, 4, 5])
  })

  it('records matching final world Z and clears it when a ring entry is reused', () => {
    const trace = new DepthTraceBuffer(true, 2)
    trace.push({ ...estimate, timestampMs: 1 })
    trace.recordWorldZ(1, 0.75)
    trace.push({ ...estimate, timestampMs: 2 })
    trace.push({ ...estimate, timestampMs: 3 })
    expect(trace.export().at(-1)?.worldZ).toBeNull()
  })

  it('does not record when debug is disabled', () => {
    const trace = new DepthTraceBuffer(false, 3)
    trace.push(estimate)
    expect(trace.export()).toEqual([])
    expect(trace.toJSON()).toBeNull()
  })
})
