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
  hands: TrackedHand[]
}

export type TrackerStatus =
  | { kind: 'loading'; message: string }
  | { kind: 'ready' }
  | { kind: 'permission-denied'; message: string }
  | { kind: 'error'; message: string }
