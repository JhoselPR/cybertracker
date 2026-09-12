import { describe, expect, it, vi } from 'vitest'
import { InteractionBridge } from '../../interaction-bridge/InteractionBridge'
import type { UiInputEvent, UiPoint } from '../../interaction-bridge/types'
import { InteractionKernel, createInitialSnapshot } from '../InteractionKernel'
import { clampPanelPosition } from '../panelDrag'
import { attachPointerInput } from '../pointerInputAdapter'

const viewport = { width: 1000, height: 1000 }
const point = (x: number, y: number): UiPoint => ({ x, y })
const bounds = (left: number, top: number, right: number, bottom: number) => () => ({ left, top, right, bottom })

function harness() {
  const initial = createInitialSnapshot(true)
  const bridge = new InteractionBridge(initial)
  const kernel = new InteractionKernel(initial, (next) => bridge.setSnapshot(next), () => viewport)
  bridge.subscribeFrames((frame) => kernel.consumeFrame(frame))
  const publish = (source: 'hand' | 'pointer', position: UiPoint, events: UiInputEvent[] = [], timestampMs = 1) => bridge.publishInputFrame({
    source,
    timestampMs,
    pointer: { position, state: 'pointing', visible: true, anchorSource: source === 'hand' ? 'aim' : 'native', quality: 'tracked' },
    events,
  })
  const event = (type: UiInputEvent['type'], position: UiPoint, reason?: 'released' | 'tracking_lost'): UiInputEvent => ({
    type,
    position,
    timestampMs: 1,
    ...(reason ? { reason } : {}),
  } as UiInputEvent)
  return { bridge, kernel, publish, event }
}

describe('InteractionKernel hit testing and selection', () => {
  it('enters once, remains without repetition, and leaves once', () => {
    const { bridge, kernel, publish } = harness()
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(100, 100, 300, 300) })
    const changes: Array<string | null> = [null]
    bridge.subscribe(() => {
      const hovered = bridge.getSnapshot().hoveredId
      if (changes.at(-1) !== hovered) changes.push(hovered)
    })
    publish('hand', point(.2, .2))
    publish('hand', point(.25, .25), [], 56)
    publish('hand', point(.8, .8), [], 120)
    publish('hand', point(.8, .8), [], 256)
    expect(changes).toEqual([null, 'a', null])
  })

  it('presses inside and activates once only on a released end over the original target', () => {
    const { bridge, kernel, publish, event } = harness()
    const activate = vi.fn()
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(100, 100, 300, 300), activate })
    publish('hand', point(.2, .2), [event('pressstart', point(.2, .2))])
    expect(bridge.getSnapshot().pressedId).toBe('a')
    publish('hand', point(.2, .2), [event('pressend', point(.2, .2), 'released')])
    publish('hand', point(.2, .2), [event('pressend', point(.2, .2), 'released')])
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('cancels release outside and any press that became a drag', () => {
    const { kernel, publish, event } = harness()
    const activate = vi.fn()
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(100, 100, 300, 300), activate })
    publish('hand', point(.2, .2), [event('pressstart', point(.2, .2))])
    publish('hand', point(.8, .8), [event('pressend', point(.8, .8), 'released')])
    publish('hand', point(.2, .2), [event('pressstart', point(.2, .2)), event('dragstart', point(.2, .2)), event('pressend', point(.2, .2), 'released')])
    expect(activate).not.toHaveBeenCalled()
  })

  it('uses deterministic stable IDs after exactness, distance, z, and semantics while disabled exact targets occlude', () => {
    const { bridge, kernel, publish, event } = harness()
    const low = vi.fn()
    kernel.registerTarget({ id: 'low', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(0, 0, 500, 500), activate: low })
    kernel.registerTarget({ id: 'newest', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(0, 0, 500, 500) })
    publish('hand', point(.2, .2))
    publish('hand', point(.2, .2), [], 56)
    expect(bridge.getSnapshot().hoveredId).toBe('low')
    kernel.registerTarget({ id: 'disabled', kind: 'button', zRank: 2, enabled: false, getBounds: bounds(0, 0, 500, 500) })
    publish('hand', point(.2, .2), [event('pressstart', point(.2, .2)), event('pressend', point(.2, .2), 'released')])
    expect(bridge.getSnapshot()).toMatchObject({ hoveredId: 'low', pressedId: null })
    expect(low).not.toHaveBeenCalled()
  })

  it('acquires a narrow header through hand-only padding while native pointer remains exact', () => {
    const { bridge, kernel, publish, event } = harness()
    kernel.registerTarget({ id: 'header', kind: 'panel-header', zRank: 1, enabled: true, getBounds: bounds(100, 100, 400, 110) })
    publish('pointer', point(.2, .084), [event('pressstart', point(.2, .084))])
    expect(bridge.getSnapshot().pressedId).toBeNull()
    publish('hand', point(.2, .084), [event('pressstart', point(.2, .084))])
    expect(bridge.getSnapshot()).toMatchObject({ pressedId: 'header', capturedId: 'header' })
  })

  it('activates a hand capture released outside exact bounds within origin slop and cancels beyond it', () => {
    const { kernel, publish, event } = harness()
    const activate = vi.fn()
    kernel.registerTarget({ id: 'narrow', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(195, 195, 205, 205), activate })
    publish('hand', point(.2, .2), [event('pressstart', point(.2, .2))])
    publish('hand', point(.225, .2), [event('pressend', point(.225, .2), 'released')])
    publish('hand', point(.2, .2), [event('pressstart', point(.2, .2))])
    publish('hand', point(.24, .2), [event('pressend', point(.24, .2), 'released')])
    expect(activate).toHaveBeenCalledOnce()
  })

  it('never activates after drag and preserves ordered capture diagnostics', () => {
    const { bridge, kernel, publish, event } = harness()
    const activate = vi.fn()
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(100, 100, 300, 300), activate })
    publish('hand', point(.2, .2), [event('pressstart', point(.2, .2)), event('dragstart', point(.2, .2))])
    expect(bridge.getSnapshot()).toMatchObject({ capturedId: 'a', dragTargetId: 'a' })
    publish('hand', point(.2, .2), [event('dragend', point(.2, .2), 'released'), event('pressend', point(.2, .2), 'released')])
    expect(activate).not.toHaveBeenCalled()
    expect(bridge.getSnapshot().history.map((entry) => entry.transition)).toEqual(['pressstart', 'dragstart', 'dragend', 'pressend'])
  })

  it('holds hover through border jitter and resolves padded overlaps deterministically', () => {
    const { bridge, kernel, publish } = harness()
    kernel.registerTarget({ id: 'zeta', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(100, 100, 120, 120) })
    kernel.registerTarget({ id: 'alpha', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(130, 100, 150, 120) })
    publish('hand', point(.125, .11), [], 0)
    publish('hand', point(.125, .11), [], 56)
    expect(bridge.getSnapshot().hoveredId).toBe('alpha')
    publish('hand', point(.151, .11), [], 70)
    publish('hand', point(.151, .11), [], 130)
    expect(bridge.getSnapshot().hoveredId).toBe('alpha')
  })

  it('uses an eight-pixel and eighty-millisecond exit band at the padded hover border', () => {
    const { bridge, kernel, publish } = harness()
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(100, 100, 120, 120) })
    publish('hand', point(.11, .11), [], 0)
    publish('hand', point(.11, .11), [], 56)
    publish('hand', point(.135, .11), [], 70)
    publish('hand', point(.135, .11), [], 149)
    expect(bridge.getSnapshot().hoveredId).toBe('a')
    publish('hand', point(.135, .11), [], 151)
    expect(bridge.getSnapshot().hoveredId).toBeNull()
  })

  it('bounds semantic transition history to the latest eight records', () => {
    const { bridge, kernel, publish, event } = harness()
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(100, 100, 300, 300) })
    for (let index = 0; index < 5; index += 1) {
      publish('hand', point(.2, .2), [event('pressstart', point(.2, .2)), event('pressend', point(.2, .2), 'released')])
    }
    expect(bridge.getSnapshot().history).toHaveLength(8)
    expect(bridge.getSnapshot().history.at(-1)?.transition).toBe('pressend')
  })

  it('lets an exact close control outrank a padded header overlap', () => {
    const { bridge, kernel, publish, event } = harness()
    kernel.registerTarget({ id: 'header', kind: 'panel-header', zRank: 10, enabled: true, getBounds: bounds(100, 100, 400, 150) })
    kernel.registerTarget({ id: 'close', kind: 'control', zRank: 11, enabled: true, getBounds: bounds(380, 100, 400, 150) })
    publish('hand', point(.39, .12), [event('pressstart', point(.39, .12))])
    expect(bridge.getSnapshot().pressedId).toBe('close')
  })

  it('clears hovered and cancels pressed target removal', () => {
    const { bridge, kernel, publish, event } = harness()
    const unregister = kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(0, 0, 500, 500) })
    publish('hand', point(.2, .2), [event('pressstart', point(.2, .2))])
    unregister()
    unregister()
    expect(bridge.getSnapshot()).toMatchObject({ hoveredId: null, pressedId: null, activeSource: null })
  })
})

describe('InteractionKernel panel capture', () => {
  it('captures the exact header, moves outside overlaps, then releases and commits', () => {
    const { bridge, kernel, publish, event } = harness()
    const applied: Array<UiPoint | null> = []
    kernel.openPanel('system')
    kernel.registerTarget({
      id: 'header', kind: 'panel-header', zRank: 10, enabled: true, getBounds: bounds(100, 100, 400, 160),
      panelDrag: { panelId: 'system', measure: () => ({ width: 300, height: 200, headerHeight: 60 }), applyLivePosition: (value) => applied.push(value) },
    })
    kernel.registerTarget({ id: 'overlap', kind: 'button', zRank: 20, enabled: true, getBounds: bounds(700, 700, 900, 900) })
    publish('hand', point(.2, .12), [event('pressstart', point(.2, .12)), event('dragstart', point(.2, .12))])
    expect(bridge.getSnapshot().capturedId).toBe('header')
    publish('hand', point(.8, .8), [event('dragmove', point(.8, .8))])
    publish('hand', point(.9, .9), [event('dragend', point(.9, .9), 'released'), event('pressend', point(.9, .9), 'released')])
    expect(applied.length).toBeGreaterThan(1)
    expect(bridge.getSnapshot().capturedId).toBeNull()
    expect(bridge.getSnapshot().panels.system.position).not.toEqual({ x: .36, y: .4 })
  })

  it('tracking loss, pointer cancel, and captured target removal cancel without activation', () => {
    for (const ending of ['tracking', 'cancel', 'remove'] as const) {
      const { bridge, kernel, publish, event } = harness()
      const activate = vi.fn()
      const cancel = vi.fn()
      const unregister = kernel.registerTarget({
        id: 'header', kind: 'panel-header', zRank: 1, enabled: true, getBounds: bounds(0, 0, 500, 200), activate,
        panelDrag: { panelId: 'system', measure: () => ({ width: 300, height: 200, headerHeight: 60 }), applyLivePosition: () => undefined, onDragCancel: cancel },
      })
      publish('hand', point(.2, .1), [event('pressstart', point(.2, .1)), event('dragstart', point(.2, .1))])
      if (ending === 'tracking') publish('hand', point(.2, .1), [event('dragend', point(.2, .1), 'tracking_lost'), event('pressend', point(.2, .1), 'tracking_lost')])
      if (ending === 'cancel') publish('hand', point(.2, .1), [{ type: 'cancel', position: point(.2, .1), timestampMs: 1, reason: 'source_cancelled' }])
      if (ending === 'remove') unregister()
      expect(bridge.getSnapshot()).toMatchObject({ capturedId: null, pressedId: null, activeSource: null })
      expect(activate).not.toHaveBeenCalled()
      expect(cancel).toHaveBeenCalledOnce()
    }
  })

  it('invalidates sibling panel controls after committed movement', () => {
    const { kernel, publish, event } = harness()
    const close = vi.fn()
    let closeBounds = { left: 300, top: 100, right: 400, bottom: 160 }
    kernel.registerTarget({ id: 'close', kind: 'control', zRank: 20, enabled: true, getBounds: () => closeBounds, activate: close })
    publish('hand', point(.35, .12))
    kernel.registerTarget({
      id: 'header', kind: 'panel-header', zRank: 10, enabled: true, getBounds: bounds(100, 100, 400, 160),
      panelDrag: {
        panelId: 'system',
        measure: () => ({ width: 300, height: 200, headerHeight: 60 }),
        applyLivePosition: (position) => {
          if (position) closeBounds = { left: 700, top: 700, right: 800, bottom: 760 }
        },
      },
    })
    publish('hand', point(.2, .12), [event('pressstart', point(.2, .12)), event('dragstart', point(.2, .12))])
    publish('hand', point(.7, .7), [event('dragmove', point(.7, .7)), event('dragend', point(.7, .7), 'released'), event('pressend', point(.7, .7), 'released')])
    publish('hand', point(.75, .72), [event('pressstart', point(.75, .72)), event('pressend', point(.75, .72), 'released')])
    expect(close).toHaveBeenCalledOnce()
  })
})

describe('source arbitration, adapter, and panel geometry', () => {
  it('does not let another source steal an active press', () => {
    const { bridge, kernel, publish, event } = harness()
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(0, 0, 500, 500) })
    publish('pointer', point(.2, .2), [event('pressstart', point(.2, .2))])
    publish('hand', point(.8, .8), [event('pressstart', point(.8, .8))])
    expect(bridge.getSnapshot()).toMatchObject({ pressedId: 'a', activeSource: 'pointer', hoveredId: 'a' })
  })

  it('clears idle hand ownership and hover when tracking has no pointer', () => {
    const { bridge, kernel, publish } = harness()
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(0, 0, 500, 500) })
    publish('hand', point(.2, .2))
    bridge.publishInputFrame({ source: 'hand', timestampMs: 2, pointer: null, events: [] })
    expect(bridge.getSnapshot()).toMatchObject({ activeSource: null, hoveredId: null })
  })

  it('the pointer adapter publishes into the same bridge and kernel', () => {
    const { bridge, kernel } = harness()
    const target = new EventTarget() as HTMLElement
    Object.assign(target, {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
      setPointerCapture: () => undefined,
      hasPointerCapture: () => false,
    })
    kernel.registerTarget({ id: 'a', kind: 'button', zRank: 1, enabled: true, getBounds: bounds(0, 0, 500, 500) })
    const detach = attachPointerInput(target, { bridge, kernel, reset: () => undefined, dispose: () => undefined })
    const down = new Event('pointerdown') as PointerEvent
    Object.assign(down, { clientX: 200, clientY: 200, pointerId: 1 })
    target.dispatchEvent(down)
    expect(bridge.getSnapshot()).toMatchObject({ pressedId: 'a', activeSource: 'pointer' })
    const cancel = new Event('pointercancel') as PointerEvent
    Object.assign(cancel, { clientX: 200, clientY: 200, pointerId: 1 })
    target.dispatchEvent(cancel)
    expect(bridge.getSnapshot().activeSource).toBeNull()
    detach()
  })

  it('clamps panels so their headers remain reachable after responsive resize', () => {
    expect(clampPanelPosition(point(2, -1), { width: 400, height: 300, headerHeight: 56 }, { width: 320, height: 240 }))
      .toEqual({ x: 0.8375, y: 0.03333333333333333 })
  })

  it('reapplies normalized panel position when viewport pixels change', () => {
    const { kernel } = harness()
    const apply = vi.fn()
    kernel.openPanel('system')
    kernel.registerTarget({
      id: 'header', kind: 'panel-header', zRank: 1, enabled: true, getBounds: bounds(0, 0, 100, 50),
      panelDrag: { panelId: 'system', measure: () => ({ width: 300, height: 200, headerHeight: 50 }), applyLivePosition: apply },
    })
    kernel.handleViewportChange()
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
  })

  it('toggles debug as immutable semantic state', () => {
    const { bridge, kernel } = harness()
    const before = bridge.getSnapshot()
    kernel.toggleDebug()
    expect(bridge.getSnapshot()).not.toBe(before)
    expect(bridge.getSnapshot().debug).toBe(false)
  })
})
