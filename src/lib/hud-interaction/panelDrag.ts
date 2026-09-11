import type { UiPoint } from '../interaction-bridge/types'
import type { PanelMetrics, ViewportSize } from './types'

const HEADER_REACH_PX = 44
const SAFE_MARGIN_PX = 8

export function clampPanelPosition(position: UiPoint, metrics: PanelMetrics, viewport: ViewportSize): UiPoint {
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  const xPx = position.x * width
  const yPx = position.y * height
  const panelFitsWidth = metrics.width <= width - SAFE_MARGIN_PX * 2
  const minX = panelFitsWidth ? SAFE_MARGIN_PX : SAFE_MARGIN_PX - Math.max(0, metrics.width - HEADER_REACH_PX)
  const maxX = panelFitsWidth ? width - SAFE_MARGIN_PX - metrics.width : width - SAFE_MARGIN_PX - HEADER_REACH_PX
  const minY = SAFE_MARGIN_PX
  const maxY = metrics.height <= height - SAFE_MARGIN_PX * 2
    ? height - SAFE_MARGIN_PX - metrics.height
    : Math.max(minY, height - SAFE_MARGIN_PX - Math.max(HEADER_REACH_PX, metrics.headerHeight))
  return {
    x: Math.min(maxX, Math.max(minX, xPx)) / width,
    y: Math.min(maxY, Math.max(minY, yPx)) / height,
  }
}

export class PanelDragSession {
  private position: UiPoint
  private previousClient: UiPoint

  constructor(
    position: UiPoint,
    pointerClient: UiPoint,
    private readonly metrics: PanelMetrics,
    private readonly viewport: ViewportSize,
  ) {
    this.position = clampPanelPosition(position, metrics, viewport)
    this.previousClient = { ...pointerClient }
  }

  move(pointerClient: UiPoint): UiPoint {
    this.position = clampPanelPosition({
      x: this.position.x + (pointerClient.x - this.previousClient.x) / this.viewport.width,
      y: this.position.y + (pointerClient.y - this.previousClient.y) / this.viewport.height,
    }, this.metrics, this.viewport)
    this.previousClient = { ...pointerClient }
    return { ...this.position }
  }

  current(): UiPoint {
    return { ...this.position }
  }
}
