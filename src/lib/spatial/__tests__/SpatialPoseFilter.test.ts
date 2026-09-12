import { describe, expect, it } from 'vitest'
import type { SpatialHandPose } from '../../../types/spatial'
import { basisFromQuaternion } from '../math'
import { SpatialPoseFilter } from '../SpatialPoseFilter'

function pose(timestampMs: number, x: number, scale: number, trackId = 1, angle = 0): SpatialHandPose {
  const quaternion = { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) }
  const basis = basisFromQuaternion(quaternion)
  return {
    timestampMs,
    trackId,
    handedness: 'Right',
    confidence: 0.9,
    center: { x, y: x },
    anchor: { x: x * 2 - 1, y: 1 - x * 2, z: 0 },
    scale,
    basis,
    normal: basis.z,
    quaternion,
  }
}

function converge(stepMs: number): SpatialHandPose {
  const filter = new SpatialPoseFilter()
  filter.update(pose(0, 0, 0.1))
  let result = pose(0, 0, 0.1)
  for (let time = stepMs; time <= 200; time += stepMs) result = filter.update(pose(time, 1, 0.4))
  return result
}

describe('SpatialPoseFilter', () => {
  it('converges consistently across different frame rates for position and scale', () => {
    const sixtyFps = converge(10)
    const twentyFps = converge(20)
    expect(sixtyFps.center.x).toBeCloseTo(twentyFps.center.x, 5)
    expect(sixtyFps.scale).toBeCloseTo(twentyFps.scale, 5)
  })

  it('takes the shortest quaternion path across equivalent hemispheres', () => {
    const filter = new SpatialPoseFilter()
    const first = filter.update(pose(0, 0.5, 0.2, 1, Math.PI / 2))
    const equivalent = pose(16, 0.5, 0.2, 1, Math.PI / 2)
    equivalent.quaternion = {
      x: -equivalent.quaternion.x,
      y: -equivalent.quaternion.y,
      z: -equivalent.quaternion.z,
      w: -equivalent.quaternion.w,
    }
    const next = filter.update(equivalent)
    expect(next.quaternion).toEqual(first.quaternion)
  })

  it('resets after a large timestamp gap and on track switch', () => {
    const filter = new SpatialPoseFilter()
    filter.update(pose(0, 0, 0.1))
    expect(filter.update(pose(300, 1, 0.4)).center.x).toBe(1)
    expect(filter.update(pose(316, 0.25, 0.2, 2)).center.x).toBe(0.25)
  })
})
