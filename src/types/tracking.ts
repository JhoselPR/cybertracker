export interface NormalizedLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export type Handedness = 'Left' | 'Right' | 'Unknown'

export interface TrackedHand {
  landmarks: NormalizedLandmark[]
  handedness: Handedness
  confidence: number
}

export interface TrackingFrame {
  hands: TrackedHand[]
  timestampMs: number
}

export interface TrackingDebugSnapshot {
  fps: number
  hands: import('./gestures').EnrichedHand[]
  /** Throttled diagnostics only; synchronous InteractionFrame events are consumed on the render frame. */
  interaction: import('./interaction').InteractionFrame | null
  spatialInteraction: import('./spatialInteraction').HologramSemanticState | null
}

export type TrackerStatus =
  | { kind: 'loading'; message: string }
  | { kind: 'ready' }
  | { kind: 'permission-denied'; message: string }
  | { kind: 'error'; message: string }
