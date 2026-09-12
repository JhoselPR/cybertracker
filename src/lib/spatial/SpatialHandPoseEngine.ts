import type { EnrichedHand, EnrichedTrackingFrame } from '../../types/gestures'
import type { SpatialHandPose } from '../../types/spatial'
import type { SpatialHandMetric } from '../../types/spatialInteraction'
import { SPATIAL_POSE_POLICY } from './config'
import { extractSpatialHandMetric, extractSpatialHandPose, type SpatialProjectionContext } from './extractSpatialHandPose'
import { SpatialPoseFilter } from './SpatialPoseFilter'

export interface SpatialHandPoseEngineOptions {
  confidenceThreshold: number
}

export interface SpatialSemanticFrame {
  anchorPose: SpatialHandPose | null
  interactionMetric: SpatialHandMetric | null
}

export class SpatialHandPoseEngine {
  private readonly filter = new SpatialPoseFilter()
  private readonly confidenceThreshold: number
  private current: SpatialHandPose | null = null

  constructor(options: Partial<SpatialHandPoseEngineOptions> = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? SPATIAL_POSE_POLICY.openPalmConfidence
    if (!Number.isFinite(this.confidenceThreshold) || this.confidenceThreshold < 0 || this.confidenceThreshold > 1) {
      throw new RangeError('confidenceThreshold must be between zero and one')
    }
  }

  processFrame(frame: EnrichedTrackingFrame, context: SpatialProjectionContext): SpatialHandPose | null {
    const eligible = frame.hands.filter((hand) => this.isEligible(hand))
    const retained = this.current ? eligible.find((hand) => hand.trackId === this.current!.trackId) : undefined
    const ranked = [...eligible].sort((a, b) => (
      b.stableGesture.confidence - a.stableGesture.confidence || a.trackId - b.trackId
    ))
    const ordered = retained ? [retained, ...ranked.filter((hand) => hand !== retained)] : ranked
    let selected: SpatialHandPose | null = null
    for (const hand of ordered) {
      selected = extractSpatialHandPose(hand, frame.timestampMs, context, this.current)
      if (selected) break
    }
    if (!selected) {
      this.current = null
      this.filter.reset()
      return null
    }
    this.current = this.filter.update(selected)
    return this.current
  }

  processSemanticFrame(
    frame: EnrichedTrackingFrame,
    context: SpatialProjectionContext,
    preferredTrackId: number | null,
  ): SpatialSemanticFrame {
    const anchorPose = this.processFrame(frame, context)
    const interactionHand = preferredTrackId === null
      ? null
      : frame.hands.find((hand) => hand.trackId === preferredTrackId) ?? null
    return {
      anchorPose,
      interactionMetric: interactionHand ? extractSpatialHandMetric(interactionHand, context) : null,
    }
  }

  reset(): void {
    this.current = null
    this.filter.reset()
  }

  private isEligible(hand: EnrichedHand): boolean {
    return hand.stableGesture.gesture === 'open_palm'
      && hand.stableGesture.confidence >= this.confidenceThreshold
  }
}
