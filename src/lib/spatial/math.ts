import type { SpatialBasis, SpatialQuaternion, SpatialVector3 } from '../../types/spatial'

export const dot3 = (a: SpatialVector3, b: SpatialVector3): number => a.x * b.x + a.y * b.y + a.z * b.z

export const cross3 = (a: SpatialVector3, b: SpatialVector3): SpatialVector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

export const subtract3 = (a: SpatialVector3, b: SpatialVector3): SpatialVector3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
})

export const scale3 = (value: SpatialVector3, scale: number): SpatialVector3 => ({
  x: value.x * scale,
  y: value.y * scale,
  z: value.z * scale,
})

export function normalize3(value: SpatialVector3): SpatialVector3 | null {
  const length = Math.hypot(value.x, value.y, value.z)
  if (!Number.isFinite(length) || length < 1e-7) return null
  return scale3(value, 1 / length)
}

export function quaternionDot(a: SpatialQuaternion, b: SpatialQuaternion): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
}

export const negateQuaternion = (value: SpatialQuaternion): SpatialQuaternion => ({
  x: -value.x,
  y: -value.y,
  z: -value.z,
  w: -value.w,
})

function normalizeQuaternion(value: SpatialQuaternion): SpatialQuaternion {
  const length = Math.hypot(value.x, value.y, value.z, value.w)
  if (!Number.isFinite(length) || length < 1e-7) return { x: 0, y: 0, z: 0, w: 1 }
  return { x: value.x / length, y: value.y / length, z: value.z / length, w: value.w / length }
}

/** Converts a right-handed orthonormal basis (matrix columns) to a plain quaternion. */
export function quaternionFromBasis(basis: SpatialBasis): SpatialQuaternion {
  const m00 = basis.x.x
  const m01 = basis.y.x
  const m02 = basis.z.x
  const m10 = basis.x.y
  const m11 = basis.y.y
  const m12 = basis.z.y
  const m20 = basis.x.z
  const m21 = basis.y.z
  const m22 = basis.z.z
  const trace = m00 + m11 + m22
  let quaternion: SpatialQuaternion
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    quaternion = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s }
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2
    quaternion = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s }
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2
    quaternion = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s }
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    quaternion = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s }
  }
  return normalizeQuaternion(quaternion)
}

export function basisFromQuaternion(value: SpatialQuaternion): SpatialBasis {
  const q = normalizeQuaternion(value)
  const { x, y, z, w } = q
  return {
    x: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + z * w), z: 2 * (x * z - y * w) },
    y: { x: 2 * (x * y - z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + x * w) },
    z: { x: 2 * (x * z + y * w), y: 2 * (y * z - x * w), z: 1 - 2 * (x * x + y * y) },
  }
}

export function slerpShortest(a: SpatialQuaternion, b: SpatialQuaternion, amount: number): SpatialQuaternion {
  const t = Math.max(0, Math.min(1, amount))
  let target = b
  let cosine = quaternionDot(a, target)
  if (cosine < 0) {
    target = negateQuaternion(target)
    cosine = -cosine
  }
  if (cosine > 0.9995) {
    return normalizeQuaternion({
      x: a.x + (target.x - a.x) * t,
      y: a.y + (target.y - a.y) * t,
      z: a.z + (target.z - a.z) * t,
      w: a.w + (target.w - a.w) * t,
    })
  }
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)))
  const denominator = Math.sin(angle)
  const fromWeight = Math.sin((1 - t) * angle) / denominator
  const toWeight = Math.sin(t * angle) / denominator
  return normalizeQuaternion({
    x: a.x * fromWeight + target.x * toWeight,
    y: a.y * fromWeight + target.y * toWeight,
    z: a.z * fromWeight + target.z * toWeight,
    w: a.w * fromWeight + target.w * toWeight,
  })
}

export const exponentialAmount = (deltaMs: number, timeConstantMs: number): number => (
  1 - Math.exp(-Math.max(0, deltaMs) / timeConstantMs)
)
