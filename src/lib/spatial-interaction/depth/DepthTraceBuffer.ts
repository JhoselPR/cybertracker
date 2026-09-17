import type { DepthEstimate, DepthTraceEntry } from './types'

export class DepthTraceBuffer {
  private readonly entries: DepthTraceEntry[]
  private active: boolean
  private writeIndex = 0
  private count = 0

  constructor(private readonly enabled: boolean, slots: number) {
    this.active = enabled
    this.entries = enabled
      ? Array.from({ length: slots }, () => ({
          timestampMs: 0, rawPalmScale: 1, baselinePalmScale: 1, scaleRatio: 1,
          filteredScaleRatio: 1, relativeDepth: 1, worldZ: null, velocity: 0, trackingValid: false,
        }))
      : []
  }

  push(estimate: DepthEstimate): void {
    if (!this.active || this.entries.length === 0) return
    const entry = this.entries[this.writeIndex]
    entry.timestampMs = estimate.timestampMs
    entry.rawPalmScale = estimate.rawPalmScale
    entry.baselinePalmScale = estimate.baselinePalmScale
    entry.scaleRatio = estimate.scaleRatio
    entry.filteredScaleRatio = estimate.filteredScaleRatio
    entry.relativeDepth = estimate.relativeDepth
    entry.worldZ = null
    entry.velocity = 0
    entry.trackingValid = estimate.trackingValid
    this.writeIndex = (this.writeIndex + 1) % this.entries.length
    this.count = Math.min(this.entries.length, this.count + 1)
  }

  recordWorldZ(timestampMs: number, worldZ: number, velocity = 0): void {
    if (!this.active || this.count === 0 || !Number.isFinite(worldZ)) return
    const latestIndex = (this.writeIndex - 1 + this.entries.length) % this.entries.length
    const entry = this.entries[latestIndex]
    if (entry.timestampMs === timestampMs) {
      entry.worldZ = worldZ
      entry.velocity = Number.isFinite(velocity) ? velocity : 0
    }
  }

  clear(): void {
    this.writeIndex = 0
    this.count = 0
  }

  setActive(active: boolean): void {
    const next = this.enabled && active
    if (!next && this.active) this.clear()
    this.active = next
  }

  export(): readonly DepthTraceEntry[] {
    if (!this.active) return []
    const result = new Array<DepthTraceEntry>(this.count)
    const start = (this.writeIndex - this.count + this.entries.length) % this.entries.length
    for (let i = 0; i < this.count; i += 1) {
      const entry = this.entries[(start + i) % this.entries.length]
      result[i] = { ...entry }
    }
    return result
  }

  toJSON(): string | null {
    return this.active ? JSON.stringify(this.export()) : null
  }
}
