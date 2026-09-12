import { HologramStateChannel } from './HologramStateChannel'
import { SpatialInteractionEngine, createInitialHologramState } from './SpatialInteractionEngine'
import { SpatialHandPoseEngine } from '../spatial/SpatialHandPoseEngine'

export interface SpatialInteractionRuntime {
  channel: HologramStateChannel
  engine: SpatialInteractionEngine
  poseEngine: SpatialHandPoseEngine
  reset(timestampMs?: number): void
  dispose(): void
}

export function createSpatialInteractionRuntime(): SpatialInteractionRuntime {
  const engine = new SpatialInteractionEngine()
  const poseEngine = new SpatialHandPoseEngine()
  const channel = new HologramStateChannel(createInitialHologramState())
  return {
    channel,
    engine,
    poseEngine,
    reset: (timestampMs = 0) => {
      poseEngine.reset()
      channel.publish(engine.reset(timestampMs))
    },
    dispose: () => {
      poseEngine.reset()
      engine.dispose()
      channel.dispose()
    },
  }
}

export * from './camera'
export * from './HologramStateChannel'
export * from './rayMath'
export * from './SpatialInteractionEngine'
export * from './SpatialTargetRegistry'
