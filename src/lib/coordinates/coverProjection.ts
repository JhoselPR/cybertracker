import type { Position2D } from '../../types/interaction'
import type { SpatialVector3 } from '../../types/spatial'

export interface CoverTransform {
  scale: number
  offsetX: number
  offsetY: number
}

function requireDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`)
  }
}

export function getCoverTransform(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CoverTransform {
  requireDimension(sourceWidth, 'sourceWidth')
  requireDimension(sourceHeight, 'sourceHeight')
  requireDimension(viewportWidth, 'viewportWidth')
  requireDimension(viewportHeight, 'viewportHeight')

  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
  return {
    scale,
    offsetX: (viewportWidth - sourceWidth * scale) / 2,
    offsetY: (viewportHeight - sourceHeight * scale) / 2,
  }
}

/** Projects raw source-normalized coordinates through a centered object-fit cover crop. */
export function projectSourceToViewport(
  position: Position2D,
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  mirrorX: boolean,
): Position2D {
  const transform = getCoverTransform(sourceWidth, sourceHeight, viewportWidth, viewportHeight)
  const sourceX = mirrorX ? 1 - position.x : position.x
  return {
    x: (sourceX * sourceWidth * transform.scale + transform.offsetX) / viewportWidth,
    y: (position.y * sourceHeight * transform.scale + transform.offsetY) / viewportHeight,
  }
}

/** Converts cover-projected viewport coordinates to WebGL normalized device coordinates. */
export function viewportNormalizedToNdc(position: Position2D): Position2D {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new RangeError('position must contain finite coordinates')
  }
  return { x: position.x * 2 - 1, y: 1 - position.y * 2 }
}

/** Unprojects NDC onto a world plane seen by a centered perspective camera. */
export function ndcToPerspectivePlane(
  ndc: Position2D,
  viewportWidth: number,
  viewportHeight: number,
  cameraZ: number,
  verticalFovDegrees: number,
  planeZ = 0,
): SpatialVector3 {
  requireDimension(viewportWidth, 'viewportWidth')
  requireDimension(viewportHeight, 'viewportHeight')
  if (![ndc.x, ndc.y, cameraZ, verticalFovDegrees, planeZ].every(Number.isFinite)) {
    throw new RangeError('projection values must be finite')
  }
  const distance = cameraZ - planeZ
  if (distance <= 0 || verticalFovDegrees <= 0 || verticalFovDegrees >= 180) {
    throw new RangeError('camera and field of view must define a visible plane')
  }
  const height = 2 * distance * Math.tan((verticalFovDegrees * Math.PI) / 360)
  return {
    x: ndc.x * height * (viewportWidth / viewportHeight) / 2,
    y: ndc.y * height / 2,
    z: planeZ,
  }
}
