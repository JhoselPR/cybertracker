import type { EnrichedTrackingFrame } from '../../types/gestures'
import type { TrackingFrame } from '../../types/tracking'
import { classifyGesture } from './classifier'
import type { GeometryContext } from './geometry'
import { GestureStabilizer, type StabilizationInput } from './stabilizer'

export class GestureEngine {
  private readonly stabilizer = new GestureStabilizer()

  processFrame(frame: TrackingFrame, context: GeometryContext): EnrichedTrackingFrame {
    const classified: StabilizationInput[] = frame.hands.map((hand) => ({
      hand,
      raw: classifyGesture(hand, context),
    }))
    const stabilized = this.stabilizer.stabilize(classified, frame.timestampMs, context)

    return {
      timestampMs: frame.timestampMs,
      hands: classified.map(({ hand, raw }, index) => ({
        ...hand,
        trackId: stabilized[index].trackId,
        rawGesture: raw,
        stableGesture: stabilized[index].stable,
      })),
    }
  }

  reset(): void {
    this.stabilizer.reset()
  }

  dispose(): void {
    this.reset()
  }
}
