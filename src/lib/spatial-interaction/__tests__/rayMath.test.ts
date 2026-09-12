import { describe, expect, it } from 'vitest'
import { HOLOGRAM_CAMERA } from '../camera'
import { intersectRaySphere, normalizedPointerToNdc, perspectiveCameraRay } from '../rayMath'
import { SpatialTargetRegistry } from '../SpatialTargetRegistry'

describe('spatial ray math', () => {
  it('converts a normalized pointer and constructs a centered perspective ray', () => {
    expect(normalizedPointerToNdc({ x: 0.25, y: 0.75 })).toEqual({ x: -0.5, y: -0.5 })
    const ray = perspectiveCameraRay(
      { x: 0.5, y: 0.5 },
      { width: 1600, height: 900 },
      HOLOGRAM_CAMERA.position,
      HOLOGRAM_CAMERA.verticalFovDegrees,
    )
    expect(ray.origin).toEqual({ x: 0, y: 0, z: 5 })
    expect(ray.direction).toEqual({ x: 0, y: 0, z: -1 })
  })

  it('returns the nearest positive point for hits and tangents, and null for misses', () => {
    const ray = { origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } }
    expect(intersectRaySphere(ray, { x: 0, y: 0, z: 0 }, 1)).toEqual({
      distance: 4,
      point: { x: 0, y: 0, z: 1 },
    })
    expect(intersectRaySphere(ray, { x: 1, y: 0, z: 0 }, 1)?.distance).toBe(5)
    expect(intersectRaySphere(ray, { x: 2, y: 0, z: 0 }, 1)).toBeNull()
  })

  it('selects the nearest enabled target and validates hysteresis radii', () => {
    const registry = new SpatialTargetRegistry()
    registry.register({ id: 'far', enabled: true, center: { x: 0, y: 0, z: -2 }, enterRadius: 0.5, exitRadius: 0.7 })
    registry.register({ id: 'near', enabled: true, center: { x: 0, y: 0, z: 1 }, enterRadius: 0.5, exitRadius: 0.7 })
    registry.register({ id: 'disabled', enabled: false, center: { x: 0, y: 0, z: 3 }, enterRadius: 0.5, exitRadius: 0.7 })
    const ray = { origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } }
    expect(registry.nearestPositiveHit(ray)?.target.id).toBe('near')
    expect(() => registry.register({ id: 'bad', enabled: true, center: { x: 0, y: 0, z: 0 }, enterRadius: 1, exitRadius: 1 }))
      .toThrow('exitRadius')
  })
})
