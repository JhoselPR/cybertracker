import { describe, expect, it } from 'vitest'
import { angleDegrees, distance2D, distance3D, normalizedDistance, vector3D } from '../geometry'

describe('gesture geometry', () => {
  it('corrects normalized coordinates for the source aspect ratio', () => {
    const origin = { x: 0, y: 0, z: 0 }
    const point = { x: 0.5, y: 0.5, z: 0 }
    expect(distance2D(origin, point, { aspectRatio: 2 })).toBeCloseTo(Math.hypot(1, 0.5))
  })

  it('calculates 3D distance and normalized distance', () => {
    const origin = { x: 0, y: 0, z: 0 }
    const point = { x: 1, y: 2, z: 2 }
    expect(distance3D(origin, point, { aspectRatio: 1 })).toBe(3)
    expect(normalizedDistance(origin, point, 1.5, { aspectRatio: 1 })).toBe(2)
  })

  it('calculates vector angles without orientation assumptions', () => {
    expect(angleDegrees({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(90)
    const a = vector3D({ x: 1, y: 1, z: 1 }, { x: 2, y: 1, z: 1 }, { aspectRatio: 1 })
    expect(angleDegrees(a, { x: -1, y: 0, z: 0 })).toBeCloseTo(180)
  })
})
