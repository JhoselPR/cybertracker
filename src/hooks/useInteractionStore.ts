import { useSyncExternalStore } from 'react'
import type { InteractionRuntime, UiSemanticSnapshot } from '../lib/interaction-bridge'

export function useInteractionStore(runtime: InteractionRuntime): UiSemanticSnapshot {
  return useSyncExternalStore(runtime.bridge.subscribe, runtime.bridge.getSnapshot, runtime.bridge.getSnapshot)
}
