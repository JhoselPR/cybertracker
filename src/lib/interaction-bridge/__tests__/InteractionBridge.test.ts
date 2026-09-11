import { describe, expect, it, vi } from 'vitest'
import type { InteractionFrame } from '../../../types/interaction'
import { InteractionBridge } from '../InteractionBridge'
import type { UiSemanticSnapshot } from '../types'
import { InteractionKernel, createInitialSnapshot } from '../../hud-interaction/InteractionKernel'

const snapshot = (hoveredId: string | null = null): UiSemanticSnapshot => Object.freeze({
  hoveredId,
  pressedId: null,
  capturedId: null,
  activeSource: null,
  panels: Object.freeze({}),
  debug: true,
})

const interactionFrame = (): InteractionFrame => ({
  timestampMs: 20,
  primaryTrackId: 1,
  primaryHand: { trackId: 1, handedness: 'Left' },
  pointer: {
    position: { x: 0.3, y: 0.4 },
    velocity: { x: 1, y: 0, magnitude: 1 },
    active: true,
    tracked: true,
    stale: false,
  },
  state: 'dragging',
  drag: null,
  events: [
    { type: 'pinchstart', timestampMs: 10, position: { x: 0.2, y: 0.4 }, velocity: { x: 0, y: 0, magnitude: 0 } },
    { type: 'dragstart', timestampMs: 15, position: { x: 0.25, y: 0.4 }, velocity: { x: 1, y: 0, magnitude: 1 }, drag: { startPosition: { x: 0.2, y: 0.4 }, currentPosition: { x: 0.25, y: 0.4 }, delta: { x: 0.05, y: 0 }, totalDelta: { x: 0.05, y: 0 }, distance: 0.05, pathLength: 0.05, durationMs: 5 } },
    { type: 'dragmove', timestampMs: 20, position: { x: 0.3, y: 0.4 }, velocity: { x: 1, y: 0, magnitude: 1 }, drag: { startPosition: { x: 0.2, y: 0.4 }, currentPosition: { x: 0.3, y: 0.4 }, delta: { x: 0.05, y: 0 }, totalDelta: { x: 0.1, y: 0 }, distance: 0.1, pathLength: 0.1, durationMs: 10 } },
  ],
})

describe('InteractionBridge', () => {
  it('keeps one cached snapshot identity across pointer-only frames', () => {
    const initial = createInitialSnapshot(true)
    const bridge = new InteractionBridge(initial)
    bridge.publishInteractionFrame(interactionFrame())
    expect(bridge.getSnapshot()).toBe(initial)
  })

  it('uses a new immutable identity only for semantic changes', () => {
    const bridge = new InteractionBridge(snapshot())
    const next = snapshot('button')
    bridge.setSnapshot(next)
    expect(bridge.getSnapshot()).toBe(next)
    expect(Object.isFrozen(bridge.getSnapshot())).toBe(true)
  })

  it('delivers cloned discrete events synchronously and in order before store notification', () => {
    const bridge = new InteractionBridge(snapshot())
    const order: string[] = []
    bridge.subscribeFrames((frame) => {
      order.push(...frame.events.map((event) => event.type))
      bridge.setSnapshot(snapshot('changed'))
    })
    bridge.subscribeFrames(() => order.push('second-subscriber'))
    bridge.subscribe(() => order.push('store-notified'))
    const source = interactionFrame()
    bridge.publishInteractionFrame(source)
    source.events[0].position.x = 0.9
    expect(order).toEqual(['pressstart', 'dragstart', 'dragmove', 'second-subscriber', 'store-notified'])
  })

  it('cleans up subscribers and isolates subscriber failures', () => {
    const bridge = new InteractionBridge(snapshot())
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const delivered = vi.fn()
    bridge.subscribeFrames(() => { throw new Error('broken') })
    const unsubscribe = bridge.subscribeFrames(delivered)
    bridge.publishInteractionFrame(interactionFrame())
    unsubscribe()
    bridge.publishInteractionFrame(interactionFrame())
    expect(delivered).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it('integrates an InteractionFrame through selection and captured panel drag', () => {
    const initial = createInitialSnapshot(true)
    const bridge = new InteractionBridge(initial)
    const kernel = new InteractionKernel(initial, (next) => bridge.setSnapshot(next), () => ({ width: 1000, height: 1000 }))
    bridge.subscribeFrames((frame) => kernel.consumeFrame(frame))
    const applied = vi.fn()
    kernel.registerTarget({
      id: 'header',
      kind: 'panel-header',
      zRank: 1,
      enabled: true,
      getBounds: () => ({ left: 100, top: 100, right: 500, bottom: 500 }),
      panelDrag: {
        panelId: 'system',
        measure: () => ({ width: 300, height: 200, headerHeight: 50 }),
        applyLivePosition: applied,
      },
    })
    bridge.publishInteractionFrame(interactionFrame())
    expect(bridge.getSnapshot()).toMatchObject({ pressedId: 'header', capturedId: 'header' })
    expect(applied).toHaveBeenCalled()
  })
})
