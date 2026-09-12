import { describe, expect, it } from 'vitest'
import { GestureStabilizer } from '../stabilizer'
import { makeHand, rawGesture } from './fixtures'

const context = { aspectRatio: 1 }

function update(stabilizer: GestureStabilizer, gesture: Parameters<typeof rawGesture>[0], timestampMs: number) {
  return stabilizer.stabilize([{ hand: makeHand('open_palm'), raw: rawGesture(gesture) }], timestampMs, context)[0]
}

describe('gesture stabilization', () => {
  it('requires dwell before initial promotion', () => {
    const stabilizer = new GestureStabilizer()
    expect(update(stabilizer, 'open_palm', 0).stable.gesture).toBe('unknown')
    expect(update(stabilizer, 'open_palm', 80).stable.gesture).toBe('unknown')
    expect(update(stabilizer, 'open_palm', 130).stable.gesture).toBe('open_palm')
  })

  it('tolerates brief unknown results and then clears the stable gesture', () => {
    const stabilizer = new GestureStabilizer()
    update(stabilizer, 'point', 0)
    update(stabilizer, 'point', 130)
    expect(update(stabilizer, 'unknown', 200).stable.gesture).toBe('point')
    expect(update(stabilizer, 'unknown', 370).stable.gesture).toBe('point')
    expect(update(stabilizer, 'unknown', 381).stable.gesture).toBe('unknown')
  })

  it('uses a longer dwell for transitions and aggregates confidence', () => {
    const stabilizer = new GestureStabilizer()
    update(stabilizer, 'point', 0)
    update(stabilizer, 'point', 130)
    expect(update(stabilizer, 'fist', 180).stable.gesture).toBe('point')
    expect(update(stabilizer, 'fist', 340).stable.gesture).toBe('point')
    const promoted = update(stabilizer, 'fist', 351)
    expect(promoted.stable.gesture).toBe('fist')
    expect(promoted.stable.confidence).toBeCloseTo(0.9)
  })

  it('expires unseen tracks and reset clears all history', () => {
    const stabilizer = new GestureStabilizer()
    const firstId = update(stabilizer, 'open_palm', 0).trackId
    stabilizer.stabilize([], 700, context)
    const afterExpiry = update(stabilizer, 'open_palm', 710)
    expect(afterExpiry.trackId).not.toBe(firstId)
    stabilizer.reset()
    expect(update(stabilizer, 'open_palm', 720).stable.gesture).toBe('unknown')
  })

  it('retains independent histories when two-hand result order swaps', () => {
    const stabilizer = new GestureStabilizer()
    const left = makeHand('open_palm', { translateX: -0.25 }, 'Left')
    const right = makeHand('fist', { translateX: 0.25 }, 'Right')
    const first = stabilizer.stabilize([
      { hand: left, raw: rawGesture('open_palm') },
      { hand: right, raw: rawGesture('fist') },
    ], 0, context)
    const swapped = stabilizer.stabilize([
      { hand: right, raw: rawGesture('fist') },
      { hand: left, raw: rawGesture('open_palm') },
    ], 130, context)

    expect(swapped[0].trackId).toBe(first[1].trackId)
    expect(swapped[0].stable.gesture).toBe('fist')
    expect(swapped[1].trackId).toBe(first[0].trackId)
    expect(swapped[1].stable.gesture).toBe('open_palm')
  })

  it('requires continuously closed evidence to acquire pinch through stabilization', () => {
    const stabilizer = new GestureStabilizer()
    expect(stabilizer.stabilize([{ hand: makeHand('pinch'), raw: rawGesture('pinch', .9, 'closed') }], 0, context)[0].stable.gesture).toBe('unknown')
    expect(stabilizer.stabilize([{ hand: makeHand('pinch'), raw: rawGesture('unknown', 0, 'ambiguous') }], 80, context)[0].stable.gesture).toBe('unknown')
    expect(stabilizer.stabilize([{ hand: makeHand('pinch'), raw: rawGesture('pinch', .9, 'closed') }], 130, context)[0].stable.gesture).toBe('unknown')
    expect(stabilizer.stabilize([{ hand: makeHand('pinch'), raw: rawGesture('pinch', .9, 'closed') }], 261, context)[0].stable.gesture).toBe('pinch')
  })

  it('holds a stable pinch in the hysteresis band and exits promptly on clear open evidence', () => {
    const stabilizer = new GestureStabilizer()
    stabilizer.stabilize([{ hand: makeHand('pinch'), raw: rawGesture('pinch', .9, 'closed') }], 0, context)
    expect(stabilizer.stabilize([{ hand: makeHand('pinch'), raw: rawGesture('pinch', .9, 'closed') }], 130, context)[0].stable.gesture).toBe('pinch')
    expect(stabilizer.stabilize([{ hand: makeHand('pinch'), raw: rawGesture('unknown', 0, 'ambiguous') }], 400, context)[0].stable.gesture).toBe('pinch')
    expect(stabilizer.stabilize([{ hand: makeHand('point'), raw: rawGesture('point', .9, 'open') }], 416, context)[0].stable.gesture).toBe('point')
  })
})
