export type UiInputSource = 'hand' | 'pointer'
export type UiPointerState = 'idle' | 'pointing' | 'pinching' | 'dragging' | 'stale'
export type UiEndReason = 'released' | 'tracking_lost' | 'source_cancelled' | 'source_replaced'

export interface UiPoint {
  x: number
  y: number
}

export interface UiPointer {
  position: UiPoint
  state: UiPointerState
  visible: boolean
}

export type UiInputEvent =
  | { type: 'move'; position: UiPoint; timestampMs: number }
  | { type: 'pressstart'; position: UiPoint; timestampMs: number }
  | { type: 'pressmove'; position: UiPoint; timestampMs: number }
  | { type: 'pressend'; position: UiPoint; timestampMs: number; reason: UiEndReason }
  | { type: 'dragstart'; position: UiPoint; timestampMs: number }
  | { type: 'dragmove'; position: UiPoint; timestampMs: number }
  | { type: 'dragend'; position: UiPoint; timestampMs: number; reason: UiEndReason }
  | { type: 'cancel'; position: UiPoint | null; timestampMs: number; reason: UiEndReason }

export interface UiInputFrame {
  source: UiInputSource
  timestampMs: number
  pointer: UiPointer | null
  events: readonly UiInputEvent[]
}

export interface HudPanelState {
  id: string
  open: boolean
  position: Readonly<UiPoint>
  z: number
}

export interface UiSemanticSnapshot {
  hoveredId: string | null
  pressedId: string | null
  capturedId: string | null
  activeSource: UiInputSource | null
  panels: Readonly<Record<string, Readonly<HudPanelState>>>
  debug: boolean
}

export type FrameSubscriber = (frame: UiInputFrame) => void
export type StoreSubscriber = () => void
