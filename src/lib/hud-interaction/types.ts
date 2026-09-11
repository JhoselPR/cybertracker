import type { UiInputSource, UiPoint } from '../interaction-bridge/types'

export type TargetKind = 'button' | 'panel-header' | 'control'

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface PanelMetrics {
  width: number
  height: number
  headerHeight: number
}

export interface PanelDragCallbacks {
  panelId: string
  measure: () => PanelMetrics
  applyLivePosition: (position: UiPoint | null) => void
  onDragStart?: () => void
  onDragMove?: (position: UiPoint) => void
  onDragEnd?: (position: UiPoint) => void
  onDragCancel?: () => void
}

export interface TargetDefinition {
  id: string
  kind: TargetKind
  zRank: number
  enabled: boolean
  getBounds: () => Bounds
  element?: Element | null
  activate?: () => void
  panelDrag?: PanelDragCallbacks
}

export interface RegisteredTarget extends TargetDefinition {
  registrationOrder: number
}

export interface ActivePointer {
  source: UiInputSource
  normalized: UiPoint
  client: UiPoint
}
