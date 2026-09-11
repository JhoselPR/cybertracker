import { describe, expect, it } from 'vitest'
import { PointerFilter } from '../PointerFilter'
import { INTERACTION_DEFAULTS } from '../config'

const options = INTERACTION_DEFAULTS

function runRamp(hz: number): number {
  const filter = new PointerFilter(options)
  let output = { x: 0, y: 0 }
  for (let index = 0; index <= hz; index += 1) {
    const time = index / hz
    output = filter.filter({ x: time, y: 0.5 }, time * 1000)
  }
  return output.x
}

describe('PointerFilter One Euro behavior', () => {
  it('returns the first sample unchanged and reset restores first-sample behavior', () => {
    const filter = new PointerFilter(options)
    expect(filter.filter({ x: 0.2, y: 0.8 }, 100)).toEqual({ x: 0.2, y: 0.8 })
    filter.filter({ x: 0.8, y: 0.2 }, 116)
    filter.reset()
    expect(filter.filter({ x: 0.7, y: 0.3 }, 10)).toEqual({ x: 0.7, y: 0.3 })
  })

  it('suppresses alternating stationary jitter', () => {
    const filter = new PointerFilter(options)
    const inputs = Array.from({ length: 30 }, (_, index) => 0.5 + (index % 2 ? 0.01 : -0.01))
    const outputs = inputs.map((x, index) => filter.filter({ x, y: 0.5 }, index * (1000 / 60)).x)
    const settled = outputs.slice(10)
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(0.006)
  })

  it('uses beta to reduce lag during fast movement', () => {
    const adaptive = new PointerFilter(options)
    const fixed = new PointerFilter({ ...options, beta: 0 })
    adaptive.filter({ x: 0, y: 0 }, 0)
    fixed.filter({ x: 0, y: 0 }, 0)
    const adaptiveOutput = adaptive.filter({ x: 1, y: 0 }, 16).x
    const fixedOutput = fixed.filter({ x: 1, y: 0 }, 16).x
    expect(adaptiveOutput).toBeGreaterThan(fixedOutput)
  })

  it('produces comparable one-second ramp output at 30, 60, and 120 Hz', () => {
    const outputs = [30, 60, 120].map(runRamp)
    expect(Math.max(...outputs) - Math.min(...outputs)).toBeLessThan(0.025)
  })

  it('does not advance on an equal timestamp and rejects decreasing or non-finite timestamps', () => {
    const filter = new PointerFilter(options)
    filter.filter({ x: 0.2, y: 0.2 }, 100)
    expect(filter.filter({ x: 0.9, y: 0.9 }, 100)).toEqual({ x: 0.2, y: 0.2 })
    expect(() => filter.filter({ x: 0.3, y: 0.3 }, 99)).toThrow(RangeError)
    expect(() => filter.filter({ x: 0.3, y: 0.3 }, Number.NaN)).toThrow(RangeError)
  })
})
