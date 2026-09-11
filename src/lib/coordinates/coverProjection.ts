import type { Position2D } from '../../types/interaction'

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
