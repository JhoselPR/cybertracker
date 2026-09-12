import { SPATIAL_POSE_POLICY } from './config'

export interface SpatialRenderState<T> {
  pose: T | null
  opacity: number
  scaleMultiplier: number
  visible: boolean
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export class SpatialPresenceController<T = import('../../types/spatial').SpatialHandPose> {
  private pose: T | null = null
  private candidateSinceMs = 0
  private lostSinceMs: number | null = null

  constructor(private readonly identity: (target: T) => unknown = (target) => (
    target as { trackId?: unknown }
  ).trackId) {}

  setTarget(pose: T | null, nowMs: number): void {
    if (pose) {
      if (!this.pose || this.identity(this.pose) !== this.identity(pose)) this.candidateSinceMs = nowMs
      this.pose = pose
      this.lostSinceMs = null
    } else if (this.pose && this.lostSinceMs === null) {
      this.lostSinceMs = nowMs
    }
  }

  sample(nowMs: number): SpatialRenderState<T> {
    if (!this.pose) return { pose: null, opacity: 0, scaleMultiplier: 0.72, visible: false }
    const appearance = clamp01((nowMs - this.candidateSinceMs - SPATIAL_POSE_POLICY.appearanceDwellMs) / SPATIAL_POSE_POLICY.fadeMs)
    let opacity = appearance
    if (this.lostSinceMs !== null) {
      const fadeElapsed = nowMs - this.lostSinceMs - SPATIAL_POSE_POLICY.disappearanceGraceMs
      if (fadeElapsed > 0) opacity *= 1 - clamp01(fadeElapsed / SPATIAL_POSE_POLICY.fadeMs)
      if (fadeElapsed >= SPATIAL_POSE_POLICY.fadeMs) {
        this.pose = null
        this.lostSinceMs = null
        return { pose: null, opacity: 0, scaleMultiplier: 0.72, visible: false }
      }
    }
    return {
      pose: this.pose,
      opacity,
      scaleMultiplier: 0.72 + opacity * 0.28,
      visible: opacity > 0,
    }
  }

  reset(): void {
    this.pose = null
    this.lostSinceMs = null
    this.candidateSinceMs = 0
  }
}
