import { describe, expect, it } from 'vitest'
import { InteractionEngine } from '../InteractionEngine'
import { interactionFrame, interactionHand, TEST_CONTEXT } from './fixtures'
import type { EnrichedHand, PinchEvidencePhase } from '../../../types/gestures'
import { HAND_INTERACTION_POLICY, validateHandInteractionPolicy } from '../../interactionPolicy'

const eventTypes = (frame: ReturnType<InteractionEngine['processFrame']>) => frame.events.map((event) => event.type)
const evidence = (hand: EnrichedHand, phase: PinchEvidencePhase): EnrichedHand => {
  hand.rawGesture.pinchEvidence = {
    phase,
    normalizedDistance: phase === 'unavailable' ? null : phase === 'closed' ? 0.2 : phase === 'open' ? 0.5 : 0.36,
  }
  hand.stableGesture.pinchEvidence = hand.rawGesture.pinchEvidence
  return hand
}

describe('physical hand interaction policy', () => {
  it('centralizes calibrated thresholds and rejects inverted pinch hysteresis', () => {
    expect(HAND_INTERACTION_POLICY).toMatchObject({
      pinchEnterThreshold: .30,
      pinchExitThreshold: .42,
      idleTrackingLossGraceMs: 180,
      interactionGraceMs: 320,
      dragStartDistance: .018,
      selectionSlop: .035,
      spatialHitPadding: 14,
      headerHitPadding: 18,
      controlHitPadding: 10,
      hoverIntentMs: 55,
      hoverExitPadding: 8,
      hoverExitGraceMs: 80,
      transitionHistoryLimit: 8,
    })
    expect(() => validateHandInteractionPolicy({ ...HAND_INTERACTION_POLICY, pinchExitThreshold: .2 })).toThrow(RangeError)
  })
})

describe('InteractionEngine state and events', () => {
  it('maps point to pointing and emits pointermove only after an advancing position change', () => {
    const engine = new InteractionEngine()
    const first = engine.processFrame(interactionFrame(0, interactionHand(1, 'point', 0.2)), TEST_CONTEXT)
    const equal = engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch', 0.8)), TEST_CONTEXT)
    const moved = engine.processFrame(interactionFrame(100, interactionHand(1, 'point', 0.8)), TEST_CONTEXT)
    expect(first.state).toBe('pointing')
    expect(first.pointer?.velocity).toEqual({ x: 0, y: 0, magnitude: 0 })
    expect(first.events).toEqual([])
    expect(equal.state).toBe('pointing')
    expect(equal.events).toEqual([])
    expect(eventTypes(moved)).toEqual(['pointermove'])
  })

  it('starts pinch once, then emits one pinchmove per advancing frame', () => {
    const engine = new InteractionEngine()
    expect(eventTypes(engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch')), TEST_CONTEXT)))
      .toEqual(['pinchstart'])
    expect(eventTypes(engine.processFrame(interactionFrame(16, interactionHand(1, 'pinch')), TEST_CONTEXT)))
      .toEqual(['pinchmove'])
    expect(eventTypes(engine.processFrame(interactionFrame(32, interactionHand(1, 'pinch')), TEST_CONTEXT)))
      .toEqual(['pinchmove'])
  })

  it('releases pinch to pointing or idle with pinchend once', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch')), TEST_CONTEXT)
    const pointing = engine.processFrame(interactionFrame(16, interactionHand(1, 'point')), TEST_CONTEXT)
    expect(pointing.state).toBe('pointing')
    expect(eventTypes(pointing)).toEqual(['pinchend'])
    expect(pointing.events[0]).toMatchObject({ type: 'pinchend', reason: 'released' })

    engine.processFrame(interactionFrame(32, interactionHand(1, 'pinch')), TEST_CONTEXT)
    const idle = engine.processFrame(interactionFrame(48, interactionHand(1, 'open_palm')), TEST_CONTEXT)
    expect(idle.state).toBe('idle')
    expect(eventTypes(idle)).toEqual(['pinchend'])
  })

  it('orders pointermove, pinchmove, then dragstart on the threshold frame', () => {
    const engine = new InteractionEngine({ dragThreshold: 0.02 })
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch', 0.2)), TEST_CONTEXT)
    const started = engine.processFrame(interactionFrame(100, interactionHand(1, 'pinch', 0.8)), TEST_CONTEXT)
    expect(started.state).toBe('dragging')
    expect(eventTypes(started)).toEqual(['pointermove', 'pinchmove', 'dragstart'])
    expect(started.drag?.distance).toBeGreaterThan(0.02)
  })

  it('emits dragmove while sustained and dragend before pinchend on release', () => {
    const engine = new InteractionEngine({ dragThreshold: 0.01 })
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch', 0.2)), TEST_CONTEXT)
    engine.processFrame(interactionFrame(100, interactionHand(1, 'pinch', 0.8)), TEST_CONTEXT)
    const moving = engine.processFrame(interactionFrame(200, interactionHand(1, 'pinch', 0.9)), TEST_CONTEXT)
    expect(eventTypes(moving)).toEqual(['pointermove', 'dragmove'])
    expect(moving.drag?.pathLength).toBeGreaterThanOrEqual(moving.drag?.distance ?? 0)
    const released = engine.processFrame(interactionFrame(300, interactionHand(1, 'fist', 0.9)), TEST_CONTEXT)
    expect(eventTypes(released)).toEqual(['pointermove', 'dragend', 'pinchend'])
    expect(released.events.slice(-2).map((event) => 'reason' in event ? event.reason : null))
      .toEqual(['released', 'released'])
  })

  it('computes visible velocity from final filtered output using actual dt', () => {
    const engine = new InteractionEngine()
    const first = engine.processFrame(interactionFrame(0, interactionHand(1, 'point', 0.2)), TEST_CONTEXT)
    const second = engine.processFrame(interactionFrame(200, interactionHand(1, 'point', 0.8)), TEST_CONTEXT)
    const displacement = second.pointer!.position.x - first.pointer!.position.x
    expect(second.pointer!.velocity.x).toBeCloseTo(displacement / 0.2)
    expect(second.pointer!.velocity.magnitude).toBeCloseTo(Math.abs(second.pointer!.velocity.x))
  })

  it('publishes clamped pointer coordinates after filtering', () => {
    const engine = new InteractionEngine()
    const frame = engine.processFrame(interactionFrame(0, interactionHand(1, 'point', -0.5, 1.5)), TEST_CONTEXT)
    expect(frame.pointer?.position).toEqual({ x: 0, y: 1 })
  })

  it('preserves lifecycle through short loss and same-track recovery', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(0, interactionHand(7, 'pinch')), TEST_CONTEXT)
    const missing = engine.processFrame(interactionFrame(100), TEST_CONTEXT)
    expect(missing).toMatchObject({ state: 'pinching', primaryTrackId: 7 })
    expect(missing.pointer).toMatchObject({ tracked: false, stale: true, active: true, quality: 'grace' })
    expect(missing.events).toEqual([])
    const recovered = engine.processFrame(interactionFrame(200, interactionHand(7, 'pinch')), TEST_CONTEXT)
    expect(recovered.state).toBe('pinching')
    expect(eventTypes(recovered)).toEqual(['pinchmove'])
  })

  it('treats a malformed primary index tip as temporary tracking loss', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(0, interactionHand(7, 'pinch')), TEST_CONTEXT)
    const malformed = interactionHand(7, 'pinch')
    malformed.landmarks = malformed.landmarks.slice(0, 8)
    malformed.rawGesture.anchors = { aim: null, pinch: null }
    evidence(malformed, 'unavailable')
    const missing = engine.processFrame(interactionFrame(50, malformed), TEST_CONTEXT)
    expect(missing).toMatchObject({ state: 'pinching', primaryTrackId: 7 })
    expect(missing.pointer).toMatchObject({ tracked: false, stale: true })
    expect(missing.events).toEqual([])
  })

  it('ends active lifecycle after prolonged loss', () => {
    const engine = new InteractionEngine({ dragThreshold: 0.01 })
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch', 0.2)), TEST_CONTEXT)
    engine.processFrame(interactionFrame(50, interactionHand(1, 'pinch', 0.8)), TEST_CONTEXT)
    engine.processFrame(interactionFrame(100), TEST_CONTEXT)
    const ended = engine.processFrame(interactionFrame(421), TEST_CONTEXT)
    expect(eventTypes(ended)).toEqual(['dragend', 'pinchend'])
    expect(ended.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'tracking_lost' }),
    ]))
    expect(ended).toMatchObject({ state: 'idle', primaryTrackId: null, pointer: null })
  })

  it('does not release on invalid pinch evidence, but releases immediately on clear open evidence', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch')), TEST_CONTEXT)
    const ambiguous = engine.processFrame(interactionFrame(100, evidence(interactionHand(1, 'pinch'), 'ambiguous')), TEST_CONTEXT)
    expect(ambiguous).toMatchObject({ state: 'pinching', terminationReason: null })
    expect(ambiguous.events).toEqual([])
    const recovered = engine.processFrame(interactionFrame(200, interactionHand(1, 'pinch')), TEST_CONTEXT)
    expect(recovered.state).toBe('pinching')
    const open = engine.processFrame(interactionFrame(216, evidence(interactionHand(1, 'open_palm'), 'open')), TEST_CONTEXT)
    expect(eventTypes(open)).toEqual(['pinchend'])
    expect(open.events[0]).toMatchObject({ reason: 'released' })
  })

  it('keeps pointer continuity when acquisition switches from aim to pinch midpoint', () => {
    const engine = new InteractionEngine({ beta: 0 })
    const pointing = interactionHand(1, 'point', 0.3)
    const before = engine.processFrame(interactionFrame(0, pointing), TEST_CONTEXT)
    const pinching = interactionHand(1, 'pinch', 0.3)
    pinching.rawGesture.anchors.pinch = { x: 0.5, y: 0.5, z: 0 }
    const acquired = engine.processFrame(interactionFrame(16, pinching), TEST_CONTEXT)
    expect(acquired.pointer?.position).toEqual(before.pointer?.position)
    expect(acquired.pointer).toMatchObject({ anchorSource: 'pinch' })
    const articulated = interactionHand(1, 'pinch', 0.3)
    articulated.rawGesture.anchors.pinch = { x: 0.55, y: 0.5, z: 0 }
    const moved = engine.processFrame(interactionFrame(116, articulated), TEST_CONTEXT)
    expect(moved.pointer!.position.x).toBeGreaterThan(acquired.pointer!.position.x)
  })

  it.each([
    ['gesture_ambiguous', (hand: EnrichedHand) => evidence(hand, 'ambiguous')],
    ['tracking_lost', () => null],
  ] as const)('ends a sustained interruption as %s with exactly-once ordered drag and pinch ends', (reason, interrupt) => {
    const engine = new InteractionEngine({ dragThreshold: 0.01 })
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch', 0.2)), TEST_CONTEXT)
    engine.processFrame(interactionFrame(50, interactionHand(1, 'pinch', 0.8)), TEST_CONTEXT)
    const first = interrupt(interactionHand(1, 'pinch'))
    engine.processFrame(first ? interactionFrame(100, first) : interactionFrame(100), TEST_CONTEXT)
    const second = interrupt(interactionHand(1, 'pinch'))
    const ended = engine.processFrame(second ? interactionFrame(421, second) : interactionFrame(421), TEST_CONTEXT)
    expect(eventTypes(ended)).toEqual(['dragend', 'pinchend'])
    expect(ended.events.map((event) => 'reason' in event ? event.reason : null)).toEqual([reason, reason])
    const later = engine.processFrame(interactionFrame(500), TEST_CONTEXT)
    expect(later.events).toEqual([])
  })

  it('rebases geometry without fake movement or duplicate lifecycle events', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch', 0.25, 0.5)), TEST_CONTEXT)
    const resized = engine.processFrame(
      interactionFrame(16, interactionHand(1, 'pinch', 0.25, 0.5)),
      { ...TEST_CONTEXT, viewportWidth: 100, viewportHeight: 200 },
    )
    expect(resized.state).toBe('pinching')
    expect(resized.events).toEqual([])
    expect(resized.pointer?.velocity).toEqual({ x: 0, y: 0, magnitude: 0 })
    expect(resized.drag?.distance).toBe(0)
  })

  it('validates timestamp order and dimensions before corrupting state', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(10, interactionHand(1, 'point')), TEST_CONTEXT)
    expect(() => engine.processFrame(interactionFrame(9), TEST_CONTEXT)).toThrow(RangeError)
    expect(() => engine.processFrame(interactionFrame(Number.NaN), TEST_CONTEXT)).toThrow(RangeError)
    expect(() => engine.processFrame(interactionFrame(20), { ...TEST_CONTEXT, viewportWidth: 0 })).toThrow(RangeError)
  })

  it('reset clears state and dispose is idempotent and final', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(100, interactionHand(1, 'pinch')), TEST_CONTEXT)
    engine.reset()
    expect(engine.processFrame(interactionFrame(0), TEST_CONTEXT)).toMatchObject({ state: 'idle', primaryTrackId: null })
    engine.dispose()
    engine.dispose()
    expect(() => engine.processFrame(interactionFrame(1), TEST_CONTEXT)).toThrow(/disposed/)
  })
})

describe('InteractionEngine primary hand policy', () => {
  it('prefers interactive confidence then trackId without handedness preference', () => {
    const engine = new InteractionEngine()
    const selected = engine.processFrame(interactionFrame(
      0,
      interactionHand(8, 'open_palm', 0.2, 0.5, 0.99, 'Right'),
      interactionHand(3, 'point', 0.4, 0.5, 0.8, 'Right'),
      interactionHand(2, 'point', 0.6, 0.5, 0.8, 'Left'),
    ), TEST_CONTEXT)
    expect(selected.primaryHand).toEqual({ trackId: 2, handedness: 'Left' })
  })

  it('uses highest-confidence valid hand as non-interactive fallback', () => {
    const engine = new InteractionEngine()
    const selected = engine.processFrame(interactionFrame(
      0,
      interactionHand(2, 'fist', 0.2, 0.5, 0.4),
      interactionHand(5, 'victory', 0.8, 0.5, 0.9),
    ), TEST_CONTEXT)
    expect(selected).toMatchObject({ primaryTrackId: 5, state: 'idle' })
    expect(selected.pointer).toMatchObject({ tracked: true, active: false })
  })

  it('keeps the selected track through order and confidence changes', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(
      0,
      interactionHand(1, 'point', 0.2, 0.5, 0.9),
      interactionHand(2, 'point', 0.8, 0.5, 0.8),
    ), TEST_CONTEXT)
    const next = engine.processFrame(interactionFrame(
      16,
      interactionHand(2, 'point', 0.8, 0.5, 0.99),
      interactionHand(1, 'open_palm', 0.2, 0.5, 0.1),
    ), TEST_CONTEXT)
    expect(next).toMatchObject({ primaryTrackId: 1, state: 'idle' })
  })

  it('does not switch during grace and acquires replacement on the frame after expiry', () => {
    const engine = new InteractionEngine()
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch')), TEST_CONTEXT)
    engine.processFrame(interactionFrame(20, interactionHand(2, 'point')), TEST_CONTEXT)
    const expired = engine.processFrame(interactionFrame(341, interactionHand(2, 'point')), TEST_CONTEXT)
    expect(eventTypes(expired)).toEqual(['pinchend'])
    expect(expired).toMatchObject({ primaryTrackId: null, state: 'idle' })
    const replacement = engine.processFrame(interactionFrame(357, interactionHand(2, 'point')), TEST_CONTEXT)
    expect(replacement).toMatchObject({ primaryTrackId: 2, state: 'pointing' })
  })

  it('never switches the primary track in the middle of a drag or its grace interval', () => {
    const engine = new InteractionEngine({ dragThreshold: 0.01 })
    engine.processFrame(interactionFrame(0, interactionHand(1, 'pinch', .2)), TEST_CONTEXT)
    const dragging = engine.processFrame(interactionFrame(50,
      interactionHand(1, 'pinch', .8, .5, .7), interactionHand(2, 'pinch', .4, .5, .99)), TEST_CONTEXT)
    expect(dragging).toMatchObject({ primaryTrackId: 1, state: 'dragging' })
    const grace = engine.processFrame(interactionFrame(100, interactionHand(2, 'pinch', .4, .5, .99)), TEST_CONTEXT)
    expect(grace).toMatchObject({ primaryTrackId: 1, state: 'dragging', pointer: { quality: 'grace' } })
  })
})
