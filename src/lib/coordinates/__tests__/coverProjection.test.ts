import { describe, expect, it } from 'vitest'
import {
  getCoverTransform,
  ndcToPerspectivePlane,
  projectSourceToViewport,
  viewportNormalizedToNdc,
} from '../coverProjection'

describe('cover projection', () => {
  it('keeps square source and viewport coordinates unchanged', () => {
    expect(projectSourceToViewport({ x: 0.25, y: 0.75 }, 100, 100, 500, 500, false))
      .toEqual({ x: 0.25, y: 0.75 })
  })

  it('centers horizontal crop for a wide source', () => {
    const transform = getCoverTransform(1600, 900, 900, 900)
    expect(transform.offsetX).toBe(-350)
    expect(projectSourceToViewport({ x: 0, y: 0.5 }, 1600, 900, 900, 900, false).x)
      .toBeCloseTo(-350 / 900)
    expect(projectSourceToViewport({ x: 0.5, y: 0.5 }, 1600, 900, 900, 900, false))
      .toEqual({ x: 0.5, y: 0.5 })
  })

  it('centers vertical crop for a tall source in a wide viewport', () => {
    const projected = projectSourceToViewport({ x: 0.5, y: 0 }, 900, 1600, 1600, 900, false)
    expect(projected.x).toBe(0.5)
    expect(projected.y).toBeLessThan(0)
  })

  it('mirrors source X exactly once before cropping', () => {
    const normal = projectSourceToViewport({ x: 0.2, y: 0.5 }, 1600, 900, 900, 900, false)
    const mirrored = projectSourceToViewport({ x: 0.2, y: 0.5 }, 1600, 900, 900, 900, true)
    expect(mirrored.x).toBeCloseTo(1 - normal.x)
    expect(projectSourceToViewport({ x: 0.8, y: 0.5 }, 1600, 900, 900, 900, true).x)
      .toBeCloseTo(normal.x)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid dimensions (%s)',
    (invalid) => {
      expect(() => getCoverTransform(invalid, 1, 1, 1)).toThrow(RangeError)
      expect(() => getCoverTransform(1, invalid, 1, 1)).toThrow(RangeError)
      expect(() => getCoverTransform(1, 1, invalid, 1)).toThrow(RangeError)
      expect(() => getCoverTransform(1, 1, 1, invalid)).toThrow(RangeError)
    },
  )

  it('maps viewport normalization into NDC and a perspective plane', () => {
    expect(viewportNormalizedToNdc({ x: 0, y: 1 })).toEqual({ x: -1, y: -1 })
    expect(viewportNormalizedToNdc({ x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 0 })
    const portrait = ndcToPerspectivePlane({ x: 1, y: 1 }, 900, 1600, 5, 45)
    const landscape = ndcToPerspectivePlane({ x: 1, y: 1 }, 1600, 900, 5, 45)
    expect(landscape.x).toBeGreaterThan(portrait.x)
    expect(landscape.y).toBeCloseTo(portrait.y)
  })
})
