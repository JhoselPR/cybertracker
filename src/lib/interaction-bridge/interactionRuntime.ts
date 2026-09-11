import { InteractionKernel, createInitialSnapshot } from '../hud-interaction/InteractionKernel'
import { InteractionBridge } from './InteractionBridge'

export interface InteractionRuntime {
  bridge: InteractionBridge
  kernel: InteractionKernel
  reset: () => void
  dispose: () => void
}

export function createInteractionRuntime(): InteractionRuntime {
  const initial = createInitialSnapshot()
  const bridge = new InteractionBridge(initial)
  const kernel = new InteractionKernel(initial, (snapshot) => bridge.setSnapshot(snapshot))
  const unsubscribe = bridge.subscribeFrames((frame) => kernel.consumeFrame(frame))
  return {
    bridge,
    kernel,
    reset: () => {
      bridge.publishInputFrame({
        source: bridge.getSnapshot().activeSource ?? 'hand',
        timestampMs: typeof performance === 'undefined' ? 0 : performance.now(),
        pointer: null,
        events: [{ type: 'cancel', position: null, timestampMs: typeof performance === 'undefined' ? 0 : performance.now(), reason: 'source_replaced' }],
      })
      kernel.reset('source_replaced')
    },
    dispose: () => {
      unsubscribe()
      kernel.dispose()
    },
  }
}
