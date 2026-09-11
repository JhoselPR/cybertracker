import { HandLandmarker } from '@mediapipe/tasks-vision'

export type HandConnection = readonly [start: number, end: number]

// Convert the SDK topology to a stable application type at the vision boundary.
export const HAND_CONNECTIONS: readonly HandConnection[] =
  HandLandmarker.HAND_CONNECTIONS.map(({ start, end }) => [start, end] as const)
