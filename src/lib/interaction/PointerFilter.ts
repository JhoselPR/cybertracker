import type { Position2D } from '../../types/interaction'

export interface OneEuroOptions {
  minCutoff: number
  beta: number
  derivativeCutoff: number
}

function alpha(cutoff: number, dt: number): number {
  return 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
}

class OneEuroScalar {
  private value: number | null = null
  private rawValue: number | null = null
  private derivative = 0
  private timestampMs: number | null = null

  constructor(private readonly options: OneEuroOptions) {}

  filter(input: number, timestampMs: number): number {
    if (!Number.isFinite(input)) throw new RangeError('filter input must be finite')
    if (!Number.isFinite(timestampMs)) throw new RangeError('timestampMs must be finite')
    if (this.timestampMs !== null && timestampMs < this.timestampMs) {
      throw new RangeError('timestampMs must not decrease')
    }
    if (this.value === null || this.timestampMs === null) {
      this.value = input
      this.rawValue = input
      this.timestampMs = timestampMs
      return input
    }
    if (timestampMs === this.timestampMs) return this.value

    const dt = (timestampMs - this.timestampMs) / 1000
    const rawDerivative = (input - this.rawValue!) / dt
    const derivativeAlpha = alpha(this.options.derivativeCutoff, dt)
    this.derivative += derivativeAlpha * (rawDerivative - this.derivative)
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(this.derivative)
    const valueAlpha = alpha(cutoff, dt)
    this.value += valueAlpha * (input - this.value)
    this.rawValue = input
    this.timestampMs = timestampMs
    return this.value
  }

  reset(): void {
    this.value = null
    this.rawValue = null
    this.derivative = 0
    this.timestampMs = null
  }
}

export class PointerFilter {
  private readonly x: OneEuroScalar
  private readonly y: OneEuroScalar

  constructor(options: OneEuroOptions) {
    this.x = new OneEuroScalar(options)
    this.y = new OneEuroScalar(options)
  }

  filter(position: Position2D, timestampMs: number): Position2D {
    return {
      x: this.x.filter(position.x, timestampMs),
      y: this.y.filter(position.y, timestampMs),
    }
  }

  reset(): void {
    this.x.reset()
    this.y.reset()
  }
}
