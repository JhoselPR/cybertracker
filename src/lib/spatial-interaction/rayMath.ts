import type { Position2D } from '../../types/interaction'
import type { SpatialRay } from '../../types/spatialInteraction'
import type { SpatialVector3 } from '../../types/spatial'
import { normalize3 } from '../spatial/math'

function requireViewport(width: number, height: number): void {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('viewport dimensions must be finite positive numbers')
  }
}

export function normalizedPointerToNdc(pointer: Position2D): Position2D {
  if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) throw new RangeError('pointer must be finite')
  return { x: pointer.x * 2 - 1, y: 1 - pointer.y * 2 }
}

export function perspectiveCameraRay(
  pointer: Position2D,
  viewport: { width: number; height: number },
  cameraPosition: SpatialVector3,
  verticalFovDegrees: number,
): SpatialRay {
  requireViewport(viewport.width, viewport.height)
  if (!Number.isFinite(verticalFovDegrees) || verticalFovDegrees <= 0 || verticalFovDegrees >= 180) {
    throw new RangeError('verticalFovDegrees must be between zero and 180')
  }
  const ndc = normalizedPointerToNdc(pointer)
  const tangent = Math.tan((verticalFovDegrees * Math.PI) / 360)
  const direction = normalize3({
    x: ndc.x * tangent * (viewport.width / viewport.height),
    y: ndc.y * tangent,
    z: -1,
  })!
  return { origin: { ...cameraPosition }, direction }
}

export interface RaySphereHit {
  distance: number
  point: SpatialVector3
}

export function intersectRaySphere(
  ray: SpatialRay,
  center: SpatialVector3,
  radius: number,
): RaySphereHit | null {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('radius must be finite and positive')
  const ox = ray.origin.x - center.x
  const oy = ray.origin.y - center.y
  const oz = ray.origin.z - center.z
  const b = ox * ray.direction.x + oy * ray.direction.y + oz * ray.direction.z
  const c = ox * ox + oy * oy + oz * oz - radius * radius
  const discriminant = b * b - c
  if (discriminant < 0) return null
  const root = Math.sqrt(discriminant)
  const near = -b - root
  const far = -b + root
  const distance = near >= 0 ? near : far >= 0 ? far : null
  if (distance === null) return null
  return {
    distance,
    point: {
      x: ray.origin.x + ray.direction.x * distance,
      y: ray.origin.y + ray.direction.y * distance,
      z: ray.origin.z + ray.direction.z * distance,
    },
  }
}

export function worldPointToNdc(
  point: SpatialVector3,
  viewport: { width: number; height: number },
  cameraPosition: SpatialVector3,
  verticalFovDegrees: number,
): Position2D {
  requireViewport(viewport.width, viewport.height)
  const distance = cameraPosition.z - point.z
  if (distance <= 0) throw new RangeError('point must be in front of the camera')
  const halfHeight = distance * Math.tan((verticalFovDegrees * Math.PI) / 360)
  return {
    x: (point.x - cameraPosition.x) / (halfHeight * (viewport.width / viewport.height)),
    y: (point.y - cameraPosition.y) / halfHeight,
  }
}

export function unprojectNdcAtDepth(
  ndc: Position2D,
  distance: number,
  viewport: { width: number; height: number },
  cameraPosition: SpatialVector3,
  verticalFovDegrees: number,
): SpatialVector3 {
  requireViewport(viewport.width, viewport.height)
  if (!Number.isFinite(distance) || distance <= 0) throw new RangeError('distance must be finite and positive')
  const halfHeight = distance * Math.tan((verticalFovDegrees * Math.PI) / 360)
  return {
    x: cameraPosition.x + ndc.x * halfHeight * (viewport.width / viewport.height),
    y: cameraPosition.y + ndc.y * halfHeight,
    z: cameraPosition.z - distance,
  }
}
