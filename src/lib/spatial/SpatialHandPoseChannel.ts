import type { SpatialHandPose } from '../../types/spatial'

export type SpatialPoseSubscriber = (pose: SpatialHandPose | null) => void

function clonePose(pose: SpatialHandPose): SpatialHandPose {
  return {
    ...pose,
    center: { ...pose.center },
    anchor: { ...pose.anchor },
    normal: { ...pose.normal },
    basis: { x: { ...pose.basis.x }, y: { ...pose.basis.y }, z: { ...pose.basis.z } },
    quaternion: { ...pose.quaternion },
  }
}

export class SpatialHandPoseChannel {
  private readonly subscribers = new Set<SpatialPoseSubscriber>()

  subscribe(subscriber: SpatialPoseSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  publish(pose: SpatialHandPose | null): void {
    const safePose = pose ? clonePose(pose) : null
    for (const subscriber of [...this.subscribers]) {
      try {
        subscriber(safePose ? clonePose(safePose) : null)
      } catch (error) {
        console.error('Spatial pose subscriber failed', error)
      }
    }
  }

  dispose(): void {
    this.publish(null)
    this.subscribers.clear()
  }
}
