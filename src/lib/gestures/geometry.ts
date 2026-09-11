import type { NormalizedLandmark } from '../../types/tracking'
import { GESTURE_THRESHOLDS } from './config'

export interface GeometryContext {
  /** Source width divided by source height. */
  aspectRatio: number
}

export interface Vector3 {
  x: number
  y: number
  z: number
}

function validAspect(context: GeometryContext): number {
  return Number.isFinite(context.aspectRatio) && context.aspectRatio > 0 ? context.aspectRatio : 1
}

function physicalVector(from: NormalizedLandmark, to: NormalizedLandmark, context: GeometryContext): Vector3 {
  const aspect = validAspect(context)
  return {
    x: (to.x - from.x) * aspect,
    y: to.y - from.y,
    z: (to.z - from.z) * aspect,
  }
}

export function vector2D(
  from: NormalizedLandmark,
  to: NormalizedLandmark,
  context: GeometryContext,
): Vector3 {
  const vector = physicalVector(from, to, context)
  vector.z = 0
  return vector
}

export function vector3D(
  from: NormalizedLandmark,
  to: NormalizedLandmark,
  context: GeometryContext,
): Vector3 {
  return physicalVector(from, to, context)
}

export function distance2D(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  context: GeometryContext,
): number {
  const vector = vector2D(a, b, context)
  return Math.hypot(vector.x, vector.y)
}

export function distance3D(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  context: GeometryContext,
): number {
  const vector = vector3D(a, b, context)
  return Math.hypot(vector.x, vector.y, vector.z)
}

export function angleDegrees(a: Vector3, b: Vector3): number {
  const denominator = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)
  if (denominator <= Number.EPSILON) return Number.NaN
  const cosine = Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / denominator))
  return (Math.acos(cosine) * 180) / Math.PI
}

export function jointAngle(
  previous: NormalizedLandmark,
  joint: NormalizedLandmark,
  next: NormalizedLandmark,
  context: GeometryContext,
): number {
  return angleDegrees(vector3D(joint, previous, context), vector3D(joint, next, context))
}

export function palmCenter(landmarks: readonly NormalizedLandmark[]): NormalizedLandmark {
  const indices = [0, 5, 9, 13, 17]
  let x = 0
  let y = 0
  let z = 0
  for (const index of indices) {
    x += landmarks[index].x
    y += landmarks[index].y
    z += landmarks[index].z
  }
  return { x: x / indices.length, y: y / indices.length, z: z / indices.length }
}

/** Palm-derived scale, intentionally independent of finger articulation. */
export function handScale(landmarks: readonly NormalizedLandmark[], context: GeometryContext): number {
  const wristToMiddle = distance3D(landmarks[0], landmarks[9], context)
  const palmWidth = distance3D(landmarks[5], landmarks[17], context)
  return (wristToMiddle + palmWidth) / 2
}

/** Approximate full hand length for diagnostics; classification uses the palm-derived scale. */
export function handLength(landmarks: readonly NormalizedLandmark[], context: GeometryContext): number {
  return distance3D(landmarks[0], landmarks[12], context)
}

export function normalizedDistance(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  scale: number,
  context: GeometryContext,
): number {
  return scale > GESTURE_THRESHOLDS.minimumHandScale ? distance3D(a, b, context) / scale : Number.NaN
}

export function isValidHandLandmarks(landmarks: readonly NormalizedLandmark[]): boolean {
  return landmarks.length === 21 && landmarks.every(({ x, y, z, visibility }) => (
    Number.isFinite(x)
    && Number.isFinite(y)
    && Number.isFinite(z)
    && (visibility === undefined || Number.isFinite(visibility))
  ))
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
