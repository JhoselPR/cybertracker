export { InteractionEngine } from './InteractionEngine'
export { INTERACTION_DEFAULTS } from './config'
export { PointerFilter, type OneEuroOptions } from './PointerFilter'
export { intentForGesture, transitionInteractionState, type InteractionIntent } from './stateMachine'
export { HAND_INTERACTION_POLICY, validateHandInteractionPolicy } from '../interactionPolicy'
export type {
  DragSnapshot,
  InteractionContext,
  InteractionEndReason,
  InteractionEngineOptions,
  InteractionEvent,
  InteractionFrame,
  InteractionState,
  Position2D,
  Velocity2D,
  VirtualPointer,
} from '../../types/interaction'
