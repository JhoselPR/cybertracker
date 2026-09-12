export type UiInputSource = 'hand' | 'pointer'
export type UiPointerState = 'idle' | 'pointing' | 'pinching' | 'dragging' | 'stale'
export type UiEndReason = 'released' | 'gesture_ambiguous' | 'tracking_lost' | 'source_cancelled' | 'source_replaced'
export type UiPointerAnchorSource = 'aim' | 'pinch' | 'retained' | 'native'
export type UiPointerQuality = 'tracked' | 'stale' | 'grace'

export interface UiPoint {
  x: number
  y: number
}

export interface UiPointer {
  position: UiPoint
  state: UiPointerState
  visible: boolean
  anchorSource: UiPointerAnchorSource
  quality: UiPointerQuality
}

export interface UiHandDiagnostics {
  primaryTrackId: number | null
  rawGesture: import('../../types/gestures').Gesture | null
  stableGesture: import('../../types/gestures').Gesture | null
  pinchPhase: import('../../types/gestures').PinchEvidencePhase | null
  pinchDistance: number | null
  interactionState: UiPointerState
  anchorSource: UiPointerAnchorSource | null
  pointerQuality: UiPointerQuality | null
  lastTransition: string | null
  terminationReason: UiEndReason | null
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
  diagnostics?: Readonly<UiHandDiagnostics>
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
  dragTargetId: string | null
  activeSource: UiInputSource | null
  pointerQuality: UiPointerQuality | null
  lastTransition: string | null
  terminationReason: UiEndReason | null
  history: readonly Readonly<UiTransitionRecord>[]
  panels: Readonly<Record<string, Readonly<HudPanelState>>>
  debug: boolean
}

export interface UiTransitionRecord {
  timestampMs: number
  transition: string
  targetId: string | null
  reason: UiEndReason | null
}

export type FrameSubscriber = (frame: UiInputFrame) => void
export type StoreSubscriber = () => void
