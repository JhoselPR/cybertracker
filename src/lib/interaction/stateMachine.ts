import type { Gesture } from '../../types/gestures'
import type { InteractionState } from '../../types/interaction'

export type InteractionIntent = 'idle' | 'pointing' | 'pinching'

export function intentForGesture(gesture: Gesture): InteractionIntent {
  if (gesture === 'point') return 'pointing'
  if (gesture === 'pinch') return 'pinching'
  return 'idle'
}

export interface StateTransition {
  next: InteractionState
  pinchStarted: boolean
  pinchMoved: boolean
  pinchEnded: boolean
  dragStarted: boolean
  dragMoved: boolean
  dragEnded: boolean
}

export function transitionInteractionState(
  current: InteractionState,
  intent: InteractionIntent,
  dragThresholdReached: boolean,
): StateTransition {
  const result: StateTransition = {
    next: intent,
    pinchStarted: false,
    pinchMoved: false,
    pinchEnded: false,
    dragStarted: false,
    dragMoved: false,
    dragEnded: false,
  }

  if (current === 'dragging') {
    if (intent === 'pinching') {
      result.next = 'dragging'
      result.dragMoved = true
    } else {
      result.dragEnded = true
      result.pinchEnded = true
    }
    return result
  }

  if (current === 'pinching') {
    if (intent !== 'pinching') {
      result.pinchEnded = true
      return result
    }
    result.pinchMoved = true
    if (dragThresholdReached) {
      result.next = 'dragging'
      result.dragStarted = true
    }
    return result
  }

  if (intent === 'pinching') {
    result.next = 'pinching'
    result.pinchStarted = true
  }
  return result
}
