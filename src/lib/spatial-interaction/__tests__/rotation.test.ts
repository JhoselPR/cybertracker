import { describe, expect, it } from 'vitest'
import type { SpatialQuaternion } from '../../../types/spatial'
import { inverseQuaternion, multiplyQuaternion, negateQuaternion, quaternionAngularDistance, validQuaternion } from '../../spatial/math'
import { GrabRotation, ROTATION_CONFIG } from '../rotation'

const identity = { x: 0, y: 0, z: 0, w: 1 }
const turn = (axis: 'x' | 'y' | 'z', angle: number): SpatialQuaternion => ({
  ...identity, [axis]: Math.sin(angle / 2), w: Math.cos(angle / 2),
})
const angle30 = Math.PI / 6

function converge(rotation: GrabRotation, current: SpatialQuaternion, hand: SpatialQuaternion, count = 90) {
  let result = current
  for (let i = 0; i < count; i += 1) result = rotation.update(result, hand, 16).quaternion
  return result
}

describe('relative grab rotation', () => {
  it('captures hand and object without an initial jump', () => {
    const rotation = new GrabRotation()
    const object = turn('x', 0.8)
    const result = rotation.update(object, turn('y', 1.2), 16)
    expect(result.quaternion).toEqual(object)
    expect(result.debug.angularVelocity).toBe(0)
    expect(result.debug.initialHandQuaternion).not.toBeNull()
  })

  it.each(['x', 'y', 'z'] as const)('converges on a relative 30 degree %s rotation', (axis) => {
    const rotation = new GrabRotation()
    rotation.update(identity, identity, 0)
    const target = turn(axis, angle30)
    const final = converge(rotation, identity, target)
    expect(quaternionAngularDistance(final, target)).toBeLessThanOrEqual(ROTATION_CONFIG.rotationDeadZoneRadians)
  })

  it('left-multiplies noncommuting multi-axis rotations with the captured object', () => {
    const rotation = new GrabRotation()
    const initialHand = turn('y', angle30)
    const object = turn('x', angle30)
    rotation.update(object, initialHand, 0)
    const hand = multiplyQuaternion(turn('z', angle30), initialHand)
    const s = Math.sin(angle30 / 2)
    const c = Math.cos(angle30 / 2)
    const expected = { x: s * c, y: s * s, z: s * c, w: c * c }
    const final = converge(rotation, object, hand)
    expect(quaternionAngularDistance(final, expected)).toBeLessThanOrEqual(0.01)
    expect(quaternionAngularDistance(final, multiplyQuaternion(object, turn('z', angle30)))).toBeGreaterThan(0.1)
  })

  it('treats q and -q as the same orientation without flipping', () => {
    const rotation = new GrabRotation()
    const hand = turn('y', 0.7)
    rotation.update(identity, hand, 0)
    expect(rotation.update(identity, negateQuaternion(hand), 16).quaternion).toEqual(identity)
    const target = turn('y', 1.2)
    const positive = converge(rotation, identity, target)
    const negative = converge(rotation, identity, negateQuaternion(target))
    expect(quaternionAngularDistance(positive, negative)).toBeLessThan(1e-7)
  })

  it.each([
    { x: 0, y: 0, z: 0, w: 0 },
    { x: NaN, y: 0, z: 0, w: 1 },
    { x: 0, y: Infinity, z: 0, w: 1 },
  ])('holds the last applied rotation for invalid quaternion %j', (sample) => {
    const rotation = new GrabRotation()
    rotation.update(identity, identity, 0)
    const last = converge(rotation, identity, turn('z', 0.5))
    const held = rotation.update(last, sample, 16)
    expect(held.quaternion).toEqual(last)
    expect(held.debug.state).toBe('invalid')
    expect(held.debug.angularVelocity).toBe(0)
  })

  it('captures a delayed first valid sample without moving the existing object', () => {
    const rotation = new GrabRotation()
    const object = turn('z', 0.4)
    expect(rotation.update(object, null, 16).quaternion).toEqual(object)
    const capture = rotation.update(object, turn('x', 1), 16)
    expect(capture.quaternion).toEqual(object)
    expect(capture.debug.initialHandQuaternion).toEqual(turn('x', 1))
  })

  it('uses one exponential smoothing stage and reports measured velocity', () => {
    const rotation = new GrabRotation()
    rotation.update(identity, identity, 0)
    const result = rotation.update(identity, turn('z', 0.5), 16)
    const step = quaternionAngularDistance(identity, result.quaternion)
    expect(step).toBeCloseTo(0.5 * (1 - Math.exp(-16 / 82)), 8)
    expect(result.debug.angularVelocity).toBeCloseTo(step / 0.016, 8)
    expect(quaternionAngularDistance(converge(rotation, result.quaternion, turn('z', 0.5)), turn('z', 0.5))).toBeLessThanOrEqual(0.01)
  })

  it('caps every applied angular step while a repeated distant target keeps converging', () => {
    const rotation = new GrabRotation()
    rotation.update(identity, identity, 0)
    const target = turn('y', 3)
    let current = identity
    let previousDistance = 3
    for (let i = 0; i < 90; i += 1) {
      const next = rotation.update(current, target, 16)
      const step = quaternionAngularDistance(current, next.quaternion)
      const distance = quaternionAngularDistance(next.quaternion, target)
      expect(step).toBeLessThanOrEqual(6 * 0.016 + 1e-7)
      expect(next.debug.angularVelocity).toBeLessThanOrEqual(6 + 1e-7)
      if (previousDistance > 0.01) expect(distance).toBeLessThan(previousDistance)
      previousDistance = distance
      current = next.quaternion
    }
    expect(previousDistance).toBeLessThanOrEqual(0.01)
  })

  it('holds small jitter but accumulates slow motion against the applied orientation', () => {
    const rotation = new GrabRotation()
    rotation.update(identity, identity, 0)
    for (const angle of [0.003, -0.004, 0.009, -0.009]) {
      expect(rotation.update(identity, turn('z', angle), 16).quaternion).toEqual(identity)
    }
    let current = identity
    for (let i = 1; i <= 150; i += 1) current = rotation.update(current, turn('z', i * 0.002), 16).quaternion
    expect(quaternionAngularDistance(identity, current)).toBeGreaterThan(0.27)
  })

  it('does not bank an invalid gap into a recovery teleport', () => {
    const rotation = new GrabRotation()
    rotation.update(identity, identity, 0)
    expect(rotation.update(identity, null, 5000).quaternion).toEqual(identity)
    const recovered = rotation.update(identity, turn('z', 3), 16)
    expect(quaternionAngularDistance(identity, recovered.quaternion)).toBeLessThanOrEqual(0.096 + 1e-7)
    const suspended = rotation.update(identity, turn('z', 3), 5000)
    const step = quaternionAngularDistance(identity, suspended.quaternion)
    expect(step).toBeLessThanOrEqual(6 * 0.05 + 1e-7)
    expect(suspended.debug.angularVelocity).toBeCloseTo(step / 5)
  })

  it('normalizes finite nonzero samples and inverts unit orientations', () => {
    const q = turn('x', 0.6)
    expect(validQuaternion({ x: 0, y: 0, z: 0, w: Number.MIN_VALUE })).toEqual(identity)
    const normalized = validQuaternion({ x: q.x * 8, y: 0, z: 0, w: q.w * 8 })!
    expect(quaternionAngularDistance(q, normalized)).toBeLessThan(1e-7)
    expect(multiplyQuaternion(normalized, inverseQuaternion(normalized))).toEqual(identity)
  })
})
