import type { Gesture, RawGestureResult } from '../../../types/gestures'
import type { Handedness, NormalizedLandmark, TrackedHand } from '../../../types/tracking'

type Pose = 'open_palm' | 'fist' | 'point' | 'pinch' | 'victory' | 'ambiguous'

const MCP_X = [-0.3, -0.1, 0.1, 0.3]

function finger(x: number, extended: boolean, splay = 0): NormalizedLandmark[] {
  if (extended) {
    return [
      { x, y: 0.3, z: 0 },
      { x: x + splay * 0.35, y: 0.06, z: -0.01 },
      { x: x + splay * 0.7, y: -0.17, z: -0.01 },
      { x: x + splay, y: -0.39, z: 0 },
    ]
  }
  return [
    { x, y: 0.3, z: 0 },
    { x, y: 0.08, z: -0.01 },
    { x: x + (x < 0 ? 0.08 : -0.08), y: 0.22, z: -0.03 },
    { x: x * 0.45, y: 0.36, z: -0.02 },
  ]
}

function physicalPose(pose: Pose): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = [{ x: 0, y: 0.62, z: 0 }]
  const thumbExtended = pose === 'open_palm'
  landmarks.push(...(thumbExtended
    ? [
        { x: -0.16, y: 0.4, z: 0 },
        { x: -0.36, y: 0.3, z: 0 },
        { x: -0.56, y: 0.21, z: 0 },
        { x: -0.76, y: 0.13, z: 0 },
      ]
    : [
        { x: -0.15, y: 0.4, z: 0 },
        { x: -0.08, y: 0.3, z: -0.01 },
        { x: 0.01, y: 0.37, z: -0.02 },
        { x: 0.07, y: 0.3, z: -0.02 },
      ]))

  const extended = pose === 'open_palm'
    ? [true, true, true, true]
    : pose === 'point' || pose === 'pinch'
      ? [true, false, false, false]
      : pose === 'victory'
        ? [true, true, false, false]
        : [false, false, false, false]

  MCP_X.forEach((x, index) => {
    const splay = pose === 'victory' && index === 0 ? -0.16 : pose === 'victory' && index === 1 ? 0.16 : 0
    landmarks.push(...finger(x, extended[index], splay))
  })

  if (pose === 'pinch') {
    const indexTip = landmarks[8]
    landmarks[4] = { x: indexTip.x + 0.07, y: indexTip.y + 0.02, z: 0 }
  }
  if (pose === 'ambiguous') {
    for (const [mcp, pip, dip, tip] of [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
      const x = landmarks[mcp].x
      landmarks[pip] = { x, y: 0.08, z: 0 }
      landmarks[dip] = { x: x + 0.12, y: -0.02, z: 0 }
      landmarks[tip] = { x: x + 0.27, y: 0.01, z: 0 }
    }
  }
  return landmarks
}

interface FixtureTransform {
  aspectRatio?: number
  translateX?: number
  translateY?: number
  scale?: number
  rotationRad?: number
  mirror?: boolean
}

export function makeHand(
  pose: Pose,
  transform: FixtureTransform = {},
  handedness: Handedness = 'Unknown',
): TrackedHand {
  const aspectRatio = transform.aspectRatio ?? 1
  const scale = transform.scale ?? 1
  const angle = transform.rotationRad ?? 0
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const direction = transform.mirror ? -1 : 1
  const landmarks = physicalPose(pose).map((point) => {
    const x = point.x * scale * direction
    const y = point.y * scale
    const rotatedX = x * cosine - y * sine
    const rotatedY = x * sine + y * cosine
    return {
      x: rotatedX / aspectRatio + (transform.translateX ?? 0.5),
      y: rotatedY + (transform.translateY ?? 0.2),
      z: point.z * scale / aspectRatio,
    }
  })
  return { landmarks, handedness, confidence: 0.95 }
}

export function rawGesture(gesture: Gesture, confidence = 0.9): RawGestureResult {
  return {
    gesture,
    confidence: gesture === 'unknown' ? 0 : confidence,
    scores: { open_palm: 0, fist: 0, point: 0, pinch: 0, victory: 0 },
    fingers: { thumb: 'ambiguous', index: 'ambiguous', middle: 'ambiguous', ring: 'ambiguous', pinky: 'ambiguous' },
    position: { x: 0.5, y: 0.5, z: 0 },
  }
}
