import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { Handedness, TrackingFrame } from '../../types/tracking'
import {
  HAND_LANDMARKER_MODEL_URL,
  HAND_LANDMARKER_OPTIONS,
  VISION_WASM_URL,
} from './config'

export interface HandTracker {
  detect(video: HTMLVideoElement, timestampMs: number): TrackingFrame
  close(): void
}

function toHandedness(label: string | undefined): Handedness {
  return label === 'Left' || label === 'Right' ? label : 'Unknown'
}

function normalizeResult(result: HandLandmarkerResult, timestampMs: number): TrackingFrame {
  return {
    timestampMs,
    hands: result.landmarks.map((landmarks, index) => {
      const category = result.handedness[index]?.[0]

      return {
        landmarks: landmarks.map(({ x, y, z, visibility }) => ({
          x,
          y,
          z,
          visibility,
        })),
        handedness: toHandedness(category?.categoryName ?? category?.displayName),
        confidence: category?.score ?? 0,
      }
    }),
  }
}

export async function createHandTracker(): Promise<HandTracker> {
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL)
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_LANDMARKER_MODEL_URL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    ...HAND_LANDMARKER_OPTIONS,
  })

  return {
    detect(video, timestampMs) {
      return normalizeResult(landmarker.detectForVideo(video, timestampMs), timestampMs)
    },
    close() {
      landmarker.close()
    },
  }
}
