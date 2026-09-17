import type { SpatialQuaternion } from '../../types/spatial'
import type { RotationDebug } from '../../types/spatialInteraction'
import { exponentialAmount, inverseQuaternion, multiplyQuaternion, quaternionAngularDistance, slerpShortest, validQuaternion } from '../spatial/math'

export const ROTATION_CONFIG = Object.freeze({
  rotationSmoothingMs: 82,
  rotationDeadZoneRadians: 0.01,
  maxAngularVelocity: 6,
  // A suspended inference loop must not turn its entire gap into one rotation step.
  maximumFrameDeltaMs: 50,
})

export const emptyRotationDebug = (): RotationDebug => ({
  handRotation: null, baselineHandRotation: null, deltaRotation: null,
  targetObjectRotation: null, appliedObjectRotation: null,
  deltaAngleFromBaseline: null, targetDeltaAngle: null, appliedDeltaAngle: null,
  remainingAngleToTarget: null, maxAngularStep: 0, rawDeltaMs: 0, effectiveDeltaMs: 0,
  holdReason: 'not-grabbed', inputEvents: [],
  handQuaternion: null, initialHandQuaternion: null, objectQuaternion: null,
  deltaAngle: 0, angularVelocity: 0, state: 'held',
})

/** One grab's relative orientation, independent of translation and depth evidence. */
export class GrabRotation {
  private initialHand: SpatialQuaternion | null = null
  private initialObject: SpatialQuaternion | null = null

  update(current: SpatialQuaternion, sample: SpatialQuaternion | null, deltaMs: number, invalid = false, holdReason: string | null = null) {
    const hand = validQuaternion(sample)
    const object = validQuaternion(current)
    const dt = Number.isFinite(deltaMs) ? Math.min(ROTATION_CONFIG.maximumFrameDeltaMs, Math.max(0, deltaMs)) : 0
    const debug: RotationDebug = {
      ...emptyRotationDebug(),
      handRotation: sample, baselineHandRotation: this.initialHand, appliedObjectRotation: current,
      rawDeltaMs: deltaMs, effectiveDeltaMs: dt, maxAngularStep: ROTATION_CONFIG.maxAngularVelocity * dt / 1000,
      appliedDeltaAngle: object && this.initialObject ? quaternionAngularDistance(object, this.initialObject) : null,
      holdReason: holdReason ?? (invalid ? 'invalid-sample' : !sample ? 'missing-orientation' : !hand ? 'invalid-quaternion' : !object ? 'invalid-object' : null),
      handQuaternion: hand, initialHandQuaternion: this.initialHand, objectQuaternion: current,
      deltaAngle: 0, angularVelocity: 0, state: invalid || (sample && !hand) ? 'invalid' : 'held',
    }
    if (!hand || !object || invalid) return { quaternion: current, debug }
    if (!this.initialHand) {
      if (holdReason) return { quaternion: current, debug }
      this.initialHand = hand
      this.initialObject = object
      debug.initialHandQuaternion = hand
      debug.baselineHandRotation = hand
      debug.state = 'valid'
      debug.deltaRotation = { x: 0, y: 0, z: 0, w: 1 }
      debug.targetObjectRotation = object
      debug.deltaAngleFromBaseline = debug.targetDeltaAngle = debug.appliedDeltaAngle = debug.remainingAngleToTarget = 0
      debug.holdReason = 'baseline-captured'
      return { quaternion: current, debug }
    }
    const delta = multiplyQuaternion(hand, inverseQuaternion(this.initialHand))
    const target = multiplyQuaternion(delta, this.initialObject!)
    debug.deltaAngle = quaternionAngularDistance(hand, this.initialHand)
    const remaining = quaternionAngularDistance(object, target)
    debug.deltaRotation = delta
    debug.targetObjectRotation = target
    debug.deltaAngleFromBaseline = debug.deltaAngle
    debug.targetDeltaAngle = quaternionAngularDistance(this.initialObject!, target)
    debug.remainingAngleToTarget = remaining
    if (holdReason) return { quaternion: current, debug }
    debug.state = 'valid'
    if (remaining <= ROTATION_CONFIG.rotationDeadZoneRadians || dt === 0) {
      debug.holdReason = dt === 0 ? 'zero-dt' : 'within-deadzone'
      return { quaternion: current, debug }
    }
    const amount = Math.min(exponentialAmount(dt, ROTATION_CONFIG.rotationSmoothingMs),
      ROTATION_CONFIG.maxAngularVelocity * dt / 1000 / remaining)
    const quaternion = slerpShortest(object, target, amount)
    debug.objectQuaternion = quaternion
    debug.appliedObjectRotation = quaternion
    debug.appliedDeltaAngle = quaternionAngularDistance(this.initialObject!, quaternion)
    debug.remainingAngleToTarget = quaternionAngularDistance(quaternion, target)
    debug.angularVelocity = quaternionAngularDistance(object, quaternion) / (deltaMs / 1000)
    return { quaternion, debug }
  }
}
