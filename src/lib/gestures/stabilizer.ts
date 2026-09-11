import type { Gesture, RawGestureResult, StableGestureResult } from '../../types/gestures'
import type { Handedness, NormalizedLandmark, TrackedHand } from '../../types/tracking'
import { STABILIZATION_POLICY as POLICY } from './config'
import { distance2D, handScale, isValidHandLandmarks, palmCenter, type GeometryContext } from './geometry'

export interface StabilizationInput {
  hand: TrackedHand
  raw: RawGestureResult
}

export interface StabilizationOutput {
  trackId: number
  stable: StableGestureResult
}

interface HandTrack {
  id: number
  handedness: Handedness
  palm: NormalizedLandmark
  wrist: NormalizedLandmark
  scale: number
  lastSeenMs: number
  stableGesture: Gesture
  stableConfidence: number
  candidateGesture: Gesture
  candidateSinceMs: number
  candidateConfidenceTotal: number
  candidateSamples: number
  unknownSinceMs: number | null
  stablePosition: NormalizedLandmark
}

interface DetectionGeometry {
  index: number
  palm: NormalizedLandmark
  wrist: NormalizedLandmark
  scale: number
}

export class GestureStabilizer {
  private tracks: HandTrack[] = []
  private nextTrackId = 1

  stabilize(
    inputs: readonly StabilizationInput[],
    timestampMs: number,
    context: GeometryContext,
  ): StabilizationOutput[] {
    this.expire(timestampMs)
    const geometries = inputs.map(({ hand, raw }, index) => {
      const valid = isValidHandLandmarks(hand.landmarks)
      return {
        index,
        palm: valid ? palmCenter(hand.landmarks) : raw.position,
        wrist: valid ? hand.landmarks[0] : raw.position,
        scale: valid ? handScale(hand.landmarks, context) : 1,
      }
    })
    const assignments = this.assign(inputs, geometries, context)
    const outputs: StabilizationOutput[] = new Array(inputs.length)

    for (const geometry of geometries) {
      const input = inputs[geometry.index]
      const track = assignments.get(geometry.index) ?? this.createTrack(input.hand.handedness, geometry, timestampMs)
      this.updateTrack(track, input.raw, input.hand.handedness, geometry, timestampMs)
      outputs[geometry.index] = {
        trackId: track.id,
        stable: {
          gesture: track.stableGesture,
          confidence: track.stableGesture === 'unknown' ? 0 : track.stableConfidence,
          position: track.stablePosition,
        },
      }
    }

    return outputs
  }

  reset(): void {
    this.tracks = []
    this.nextTrackId = 1
  }

  private assign(
    inputs: readonly StabilizationInput[],
    geometries: readonly DetectionGeometry[],
    context: GeometryContext,
  ): Map<number, HandTrack> {
    const candidates: Array<{ detectionIndex: number; track: HandTrack; cost: number }> = []
    for (const geometry of geometries) {
      for (const track of this.tracks) {
        const scale = Math.max((geometry.scale + track.scale) / 2, Number.EPSILON)
        const palmDistance = distance2D(geometry.palm, track.palm, context) / scale
        const wristDistance = distance2D(geometry.wrist, track.wrist, context) / scale
        const spatial = (palmDistance * 2 + wristDistance) / 3
        const mismatch = inputs[geometry.index].hand.handedness !== 'Unknown'
          && track.handedness !== 'Unknown'
          && inputs[geometry.index].hand.handedness !== track.handedness
        const cost = spatial + (mismatch ? POLICY.handednessMismatchPenalty : 0)
        if (spatial <= POLICY.maximumMatchDistance) candidates.push({ detectionIndex: geometry.index, track, cost })
      }
    }
    candidates.sort((a, b) => a.cost - b.cost || a.track.id - b.track.id || a.detectionIndex - b.detectionIndex)

    const assignments = new Map<number, HandTrack>()
    const usedTracks = new Set<number>()
    for (const candidate of candidates) {
      if (assignments.has(candidate.detectionIndex) || usedTracks.has(candidate.track.id)) continue
      assignments.set(candidate.detectionIndex, candidate.track)
      usedTracks.add(candidate.track.id)
    }
    return assignments
  }

  private createTrack(handedness: Handedness, geometry: DetectionGeometry, timestampMs: number): HandTrack {
    const track: HandTrack = {
      id: this.nextTrackId++,
      handedness,
      palm: geometry.palm,
      wrist: geometry.wrist,
      scale: geometry.scale,
      lastSeenMs: timestampMs,
      stableGesture: 'unknown',
      stableConfidence: 0,
      candidateGesture: 'unknown',
      candidateSinceMs: timestampMs,
      candidateConfidenceTotal: 0,
      candidateSamples: 0,
      unknownSinceMs: null,
      stablePosition: geometry.palm,
    }
    this.tracks.push(track)
    return track
  }

  private updateTrack(
    track: HandTrack,
    raw: RawGestureResult,
    handedness: Handedness,
    geometry: DetectionGeometry,
    timestampMs: number,
  ): void {
    track.lastSeenMs = timestampMs
    track.palm = geometry.palm
    track.wrist = geometry.wrist
    track.scale = geometry.scale
    if (handedness !== 'Unknown') track.handedness = handedness

    if (raw.gesture === 'unknown') {
      track.unknownSinceMs ??= timestampMs
      if (timestampMs - track.unknownSinceMs >= POLICY.unknownGraceMs) {
        track.stableGesture = 'unknown'
        track.stableConfidence = 0
        this.startCandidate(track, 'unknown', timestampMs, 0)
      }
      return
    }

    track.unknownSinceMs = null
    if (raw.gesture === track.stableGesture) {
      track.stableConfidence += (raw.confidence - track.stableConfidence) * POLICY.confidenceSmoothing
      track.stablePosition = raw.position
      this.startCandidate(track, raw.gesture, timestampMs, raw.confidence)
      return
    }

    if (raw.gesture !== track.candidateGesture) {
      this.startCandidate(track, raw.gesture, timestampMs, raw.confidence)
      return
    }

    track.candidateConfidenceTotal += raw.confidence
    track.candidateSamples += 1
    const dwell = track.stableGesture === 'unknown' ? POLICY.initialDwellMs : POLICY.transitionDwellMs
    if (timestampMs - track.candidateSinceMs >= dwell) {
      track.stableGesture = raw.gesture
      track.stableConfidence = track.candidateConfidenceTotal / track.candidateSamples
      track.stablePosition = raw.position
    }
  }

  private startCandidate(track: HandTrack, gesture: Gesture, timestampMs: number, confidence: number): void {
    track.candidateGesture = gesture
    track.candidateSinceMs = timestampMs
    track.candidateConfidenceTotal = confidence
    track.candidateSamples = 1
  }

  private expire(timestampMs: number): void {
    this.tracks = this.tracks.filter((track) => timestampMs - track.lastSeenMs <= POLICY.trackExpiryMs)
  }
}
