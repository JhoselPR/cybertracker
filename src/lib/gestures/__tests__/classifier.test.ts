import { describe, expect, it } from 'vitest'
import type { TrackedHand } from '../../../types/tracking'
import { classifyGesture } from '../classifier'
import { GestureEngine } from '../GestureEngine'
import { makeHand } from './fixtures'

const context = { aspectRatio: 1 }

describe('static gesture classification', () => {
  it.each(['open_palm', 'fist', 'point', 'pinch', 'victory'] as const)('classifies %s', (gesture) => {
    expect(classifyGesture(makeHand(gesture), context).gesture).toBe(gesture)
  })

  it('exposes all five intermediate finger states', () => {
    const open = classifyGesture(makeHand('open_palm'), context)
    const point = classifyGesture(makeHand('point'), context)
    expect(Object.keys(open.fingers)).toEqual(['thumb', 'index', 'middle', 'ring', 'pinky'])
    expect(Object.values(open.fingers)).toEqual(['extended', 'extended', 'extended', 'extended', 'extended'])
    expect(point.fingers).toMatchObject({ index: 'extended', middle: 'folded', ring: 'folded', pinky: 'folded' })
  })

  it('uses raw gesture-specific positions without mirroring', () => {
    const pinchHand = makeHand('pinch')
    const pinch = classifyGesture(pinchHand, context)
    expect(pinch.position.x).toBeCloseTo((pinchHand.landmarks[4].x + pinchHand.landmarks[8].x) / 2)
    const pointHand = makeHand('point')
    expect(classifyGesture(pointHand, context).position).toEqual(pointHand.landmarks[8])
  })

  it('prefers unknown for ambiguous, malformed, and degenerate poses', () => {
    const malformed: TrackedHand = { ...makeHand('open_palm'), landmarks: makeHand('open_palm').landmarks.slice(0, 20) }
    const degenerate: TrackedHand = {
      ...makeHand('open_palm'),
      landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
    }
    const nonFinite: TrackedHand = makeHand('open_palm')
    nonFinite.landmarks[0] = { ...nonFinite.landmarks[0], y: Number.NaN }
    expect(classifyGesture(makeHand('ambiguous'), context).gesture).toBe('unknown')
    expect(classifyGesture(malformed, context).gesture).toBe('unknown')
    expect(classifyGesture(degenerate, context).gesture).toBe('unknown')
    const nonFiniteResult = classifyGesture(nonFinite, context)
    expect(nonFiniteResult.gesture).toBe('unknown')
    expect(Object.values(nonFiniteResult.position).every(Number.isFinite)).toBe(true)
    expect(new GestureEngine().processFrame({ hands: [malformed], timestampMs: 0 }, context).hands[0].rawGesture.gesture).toBe('unknown')
  })

  it('is invariant under translation, scale, rotation, and mirroring', () => {
    const transforms = [
      { translateX: -1.2, translateY: 0.8 },
      { scale: 1.7 },
      { rotationRad: Math.PI * 0.43 },
      { mirror: true },
    ]
    for (const transform of transforms) {
      expect(classifyGesture(makeHand('point', transform), context).gesture).toBe('point')
    }
  })

  it('produces the same result for equivalent source-aspect geometry', () => {
    const square = classifyGesture(makeHand('victory', { aspectRatio: 1 }), { aspectRatio: 1 })
    const wide = classifyGesture(makeHand('victory', { aspectRatio: 16 / 9 }), { aspectRatio: 16 / 9 })
    expect(wide.gesture).toBe(square.gesture)
    expect(wide.confidence).toBeCloseTo(square.confidence)
  })

  it('gives pinch precedence over an otherwise pointing pose', () => {
    const result = classifyGesture(makeHand('pinch'), context)
    expect(result.scores.point).toBeGreaterThan(0.7)
    expect(result.gesture).toBe('pinch')
  })

  it('changes pinch confidence continuously with thumb/index distance', () => {
    const near = makeHand('pinch')
    const far = makeHand('pinch')
    far.landmarks[4] = { ...far.landmarks[4], x: far.landmarks[8].x + 0.2 }
    const outside = makeHand('pinch')
    outside.landmarks[4] = { ...outside.landmarks[4], x: outside.landmarks[8].x + 0.32 }

    const nearResult = classifyGesture(near, context)
    const farResult = classifyGesture(far, context)
    const outsideResult = classifyGesture(outside, context)
    expect(nearResult.scores.pinch).toBeGreaterThan(farResult.scores.pinch)
    expect(farResult.scores.pinch).toBeGreaterThan(outsideResult.scores.pinch)
    expect(nearResult.confidence).toBeGreaterThan(outsideResult.confidence)
  })
})
