import type { SpatialHandPose } from '../../types/spatial'
import { viewportNormalizedToNdc } from '../coordinates'
import { SPATIAL_POSE_POLICY } from './config'
import { basisFromQuaternion, exponentialAmount, slerpShortest } from './math'

export class SpatialPoseFilter {
  private value: SpatialHandPose | null = null

  update(next: SpatialHandPose): SpatialHandPose {
    const previous = this.value
    const deltaMs = previous ? next.timestampMs - previous.timestampMs : Number.POSITIVE_INFINITY
    if (!previous || previous.trackId !== next.trackId || deltaMs <= 0 || deltaMs > SPATIAL_POSE_POLICY.resetGapMs) {
      this.value = next
      return next
    }
    const positionAmount = exponentialAmount(deltaMs, SPATIAL_POSE_POLICY.positionTimeConstantMs)
    const scaleAmount = exponentialAmount(deltaMs, SPATIAL_POSE_POLICY.scaleTimeConstantMs)
    const orientationAmount = exponentialAmount(deltaMs, SPATIAL_POSE_POLICY.orientationTimeConstantMs)
    const center = {
      x: previous.center.x + (next.center.x - previous.center.x) * positionAmount,
      y: previous.center.y + (next.center.y - previous.center.y) * positionAmount,
    }
    const ndc = viewportNormalizedToNdc(center)
    const quaternion = slerpShortest(previous.quaternion, next.quaternion, orientationAmount)
    const basis = basisFromQuaternion(quaternion)
    this.value = {
      ...next,
      center,
      anchor: { ...ndc, z: 0 },
      scale: previous.scale + (next.scale - previous.scale) * scaleAmount,
      basis,
      normal: basis.z,
      quaternion,
    }
    return this.value
  }

  reset(): void {
    this.value = null
  }
}
