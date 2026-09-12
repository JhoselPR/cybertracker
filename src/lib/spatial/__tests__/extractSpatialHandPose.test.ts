import { describe, expect, it } from 'vitest'
import { extractSpatialHandPose } from '../extractSpatialHandPose'
import { dot3 } from '../math'
import { projectionContext, spatialHand } from './fixtures'

describe('extractSpatialHandPose', () => {
  it('extracts the finite wrist/MCP center and robust projected palm size', () => {
    const pose = extractSpatialHandPose(spatialHand(), 10, projectionContext)
    expect(pose?.center.x).toBeCloseTo(0.5)
    expect(pose?.center.y).toBeCloseTo(0.564)
    expect(pose?.scale).toBeCloseTo(Math.sqrt(0.6 * Math.hypot(0.1, 0.32)))
    expect(pose?.anchor).toMatchObject({ x: 0, z: 0 })
  })

  it('builds an orthonormal right-handed basis for front, inclined, and rotated palms', () => {
    const front = extractSpatialHandPose(spatialHand(), 10, projectionContext)!
    const inclinedHand = spatialHand()
    inclinedHand.landmarks = inclinedHand.landmarks.map((point) => ({ ...point, z: point.x * 0.25 }))
    const inclined = extractSpatialHandPose(inclinedHand, 20, projectionContext)!
    const rotated = extractSpatialHandPose(spatialHand(1, 0.9, 'Right', { rotationRad: Math.PI / 3 }), 30, projectionContext)!
    for (const pose of [front, inclined, rotated]) {
      expect(Math.hypot(pose.basis.x.x, pose.basis.x.y, pose.basis.x.z)).toBeCloseTo(1)
      expect(Math.hypot(pose.basis.y.x, pose.basis.y.y, pose.basis.y.z)).toBeCloseTo(1)
      expect(dot3(pose.basis.x, pose.basis.y)).toBeCloseTo(0)
      expect(pose.normal).toEqual(pose.basis.z)
    }
    expect(Math.abs(inclined.normal.x) + Math.abs(inclined.normal.y)).toBeGreaterThan(0)
    expect(rotated.quaternion).not.toEqual(front.quaternion)
  })

  it('preserves handedness labels without changing equivalent geometry', () => {
    const left = extractSpatialHandPose(spatialHand(1, 0.9, 'Left'), 10, projectionContext)!
    const right = extractSpatialHandPose(spatialHand(2, 0.9, 'Right'), 10, projectionContext)!
    expect(left.handedness).toBe('Left')
    expect(right.handedness).toBe('Right')
    expect(left.normal).toEqual(right.normal)
  })

  it('mirrors exactly once through cover projection', () => {
    const hand = spatialHand(1, 0.9, 'Right', { translateX: 0.6 })
    const normal = extractSpatialHandPose(hand, 10, projectionContext)!
    const mirrored = extractSpatialHandPose(hand, 10, { ...projectionContext, mirrorX: true })!
    expect(mirrored.center.x).toBeCloseTo(1 - normal.center.x)
    expect(mirrored.basis.x.x).toBeCloseTo(-normal.basis.x.x)
  })

  it('returns null for nonfinite and degenerate semantic palm points', () => {
    const nonfinite = spatialHand()
    const [first, ...rest] = nonfinite.landmarks
    nonfinite.landmarks = [{ ...first, x: Number.NaN }, ...rest]
    expect(extractSpatialHandPose(nonfinite, 10, projectionContext)).toBeNull()

    const degenerate = spatialHand()
    degenerate.landmarks = degenerate.landmarks.map(() => ({ x: 0.5, y: 0.5, z: 0 }))
    expect(extractSpatialHandPose(degenerate, 10, projectionContext)).toBeNull()
  })

  it('uses only a brief same-track orientation fallback and keeps quaternion hemisphere', () => {
    const valid = extractSpatialHandPose(spatialHand(), 10, projectionContext)!
    const degenerate = spatialHand()
    degenerate.landmarks = degenerate.landmarks.map((point) => ({ ...point, y: 0.5 }))
    const brief = extractSpatialHandPose(degenerate, 70, projectionContext, valid)
    const expired = extractSpatialHandPose(degenerate, 100, projectionContext, valid)
    expect(brief?.quaternion).toEqual(valid.quaternion)
    expect(expired).toBeNull()
  })
})
