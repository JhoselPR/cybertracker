import { SpatialHandPoseChannel } from './SpatialHandPoseChannel'
import { SpatialHandPoseEngine } from './SpatialHandPoseEngine'

export interface SpatialHandPoseRuntime {
  channel: SpatialHandPoseChannel
  engine: SpatialHandPoseEngine
  reset(): void
  dispose(): void
}

export function createSpatialHandPoseRuntime(): SpatialHandPoseRuntime {
  const channel = new SpatialHandPoseChannel()
  const engine = new SpatialHandPoseEngine()
  return {
    channel,
    engine,
    reset: () => {
      engine.reset()
      channel.publish(null)
    },
    dispose: () => {
      engine.reset()
      channel.dispose()
    },
  }
}

export { SPATIAL_POSE_POLICY } from './config'
export { extractSpatialHandMetric, extractSpatialHandPose, type SpatialProjectionContext } from './extractSpatialHandPose'
export { SpatialHandPoseChannel, type SpatialPoseSubscriber } from './SpatialHandPoseChannel'
export {
  SpatialHandPoseEngine,
  type SpatialHandPoseEngineOptions,
  type SpatialSemanticFrame,
} from './SpatialHandPoseEngine'
export { SpatialPoseFilter } from './SpatialPoseFilter'
export { SpatialPresenceController, type SpatialRenderState } from './SpatialPresenceController'
export * from './math'
