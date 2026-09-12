import type { UiInputFrame } from '../../lib/interaction-bridge'
import type { SpatialCursorState } from '../../types/spatialInteraction'

export function paintSpatialCursor(
  cursor: HTMLDivElement,
  frame: UiInputFrame | null,
  spatialState: SpatialCursorState,
  viewport: { width: number; height: number },
): void {
  const pointer = frame?.pointer
  cursor.dataset.state = spatialState
  if (!pointer?.visible) {
    cursor.style.visibility = 'hidden'
    return
  }
  cursor.style.visibility = 'visible'
  cursor.style.transform = `translate3d(${pointer.position.x * viewport.width}px, ${pointer.position.y * viewport.height}px, 0)`
  cursor.dataset.quality = pointer.quality
}
