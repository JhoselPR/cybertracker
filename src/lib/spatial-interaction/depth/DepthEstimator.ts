import { AdaptiveDepthFilter } from './AdaptiveDepthFilter'
import { DEPTH_CONFIG, type DepthConfig } from './config'
import { apparentPalmScale, median } from './depthSignals'
import { DepthTraceBuffer } from './DepthTraceBuffer'
import type { DepthEstimate, DepthEvidence } from './types'

function heldEstimate(timestampMs = 0, relativeDepth = 1): DepthEstimate {
  return {
    timestampMs, rawPalmScale: 1, baselinePalmScale: 1, scaleRatio: 1, filteredScaleRatio: relativeDepth,
    relativeDepth, velocity: 0, trackingValid: false,
  }
}

export interface DepthEstimatorOptions {
  config?: DepthConfig
  debugEnabled?: boolean
}

export class DepthEstimator {
  private readonly config: DepthConfig
  private readonly trace: DepthTraceBuffer
  private readonly filter = new AdaptiveDepthFilter()
  private readonly timestamps: Float64Array
  private readonly scales: Float64Array
  private historyWrite = 0
  private historyCount = 0
  private trackId: number | null = null
  private projectionId: number | null = null
  private lastObservedTimestamp: number | null = null
  private baselinePalmScale = 1
  private grabbing = false
  private baselineReady = false
  private lastTimestamp: number | null = null
  private lastAppliedLog = 0
  private estimate: DepthEstimate = heldEstimate()

  constructor(options: DepthEstimatorOptions = {}) {
    this.config = options.config ?? DEPTH_CONFIG
    this.timestamps = new Float64Array(this.config.historySlots)
    this.scales = new Float64Array(this.config.historySlots)
    this.trace = new DepthTraceBuffer(Boolean(options.debugEnabled), this.config.traceSlots)
  }

  observe(evidence: DepthEvidence | null, timestampMs = evidence?.timestampMs): void {
    if (!evidence || !this.validIdentity(evidence)) {
      if (this.grabbing) this.hold(timestampMs)
      return
    }

    const identityChanged = this.identityChanged(evidence)
    const timestampDecreased = this.lastObservedTimestamp !== null && evidence.timestampMs < this.lastObservedTimestamp
    if (this.grabbing && (identityChanged || timestampDecreased)) {
      this.baselineReady = false
      this.resetHistory(evidence.trackId, evidence.projectionId)
      this.hold(evidence.timestampMs)
      return
    }
    if (identityChanged || timestampDecreased) this.resetHistory(evidence.trackId, evidence.projectionId)
    if (this.lastObservedTimestamp !== null && evidence.timestampMs === this.lastObservedTimestamp) {
      if (this.grabbing) this.hold(evidence.timestampMs)
      return
    }

    this.lastObservedTimestamp = evidence.timestampMs
    this.trackId = evidence.trackId
    this.projectionId = evidence.projectionId
    if (this.grabbing) this.updateGrab(evidence)
    else this.addHistory(evidence)
  }

  beginGrab(trackId: number, timestampMs: number, projectionId: number): DepthEstimate {
    this.grabbing = true
    this.filter.reset(0)
    this.lastAppliedLog = 0
    this.lastTimestamp = timestampMs
    this.baselineReady = Number.isFinite(timestampMs)
      && trackId === this.trackId
      && projectionId === this.projectionId
      && this.buildBaseline(timestampMs)
    this.estimate = this.baselineReady
      ? {
          ...heldEstimate(timestampMs), rawPalmScale: this.baselinePalmScale,
          baselinePalmScale: this.baselinePalmScale, trackingValid: true,
        }
      : heldEstimate(timestampMs)
    this.trace.push(this.estimate)
    return this.snapshot()
  }

  endGrab(): void {
    this.grabbing = false
    this.baselineReady = false
    this.lastTimestamp = null
    this.lastAppliedLog = 0
  }

  current(): DepthEstimate {
    return this.snapshot()
  }

  exportTraceJSON(): string | null {
    return this.trace.toJSON()
  }

  setDebugEnabled(enabled: boolean): void {
    this.trace.setActive(enabled)
  }

  exportTrace() {
    return this.trace.export()
  }

  reset(): void {
    this.resetHistory(null, null)
    this.grabbing = false
    this.baselineReady = false
    this.lastTimestamp = null
    this.lastAppliedLog = 0
    this.filter.reset(0)
    this.estimate = heldEstimate()
    this.trace.clear()
  }

  private updateGrab(evidence: DepthEvidence): void {
    if (!this.baselineReady || evidence.trackId !== this.trackId || evidence.projectionId !== this.projectionId) {
      this.hold(evidence.timestampMs)
      return
    }
    if (this.lastTimestamp !== null && evidence.timestampMs <= this.lastTimestamp) {
      this.hold(evidence.timestampMs)
      return
    }

    const rawPalmScale = apparentPalmScale(evidence.distances, evidence.validMask, this.config.minimumSegmentDistance)
    if (!(rawPalmScale > 0) || !Number.isFinite(rawPalmScale)
      || !(this.baselinePalmScale > 0) || !Number.isFinite(this.baselinePalmScale)) {
      this.hold(evidence.timestampMs)
      return
    }

    const scaleRatio = rawPalmScale / this.baselinePalmScale
    const logScaleRatio = Math.log(scaleRatio)
    if (!(scaleRatio > 0) || !Number.isFinite(scaleRatio) || !Number.isFinite(logScaleRatio)) {
      this.hold(evidence.timestampMs)
      return
    }

    const dtSeconds = this.lastTimestamp === null ? 0 : (evidence.timestampMs - this.lastTimestamp) / 1000
    const targetLog = Math.abs(logScaleRatio) <= this.config.deadZoneLog ? 0 : logScaleRatio
    const filteredLog = this.filter.update(targetLog, dtSeconds, this.config.smoothingTimeConstantSeconds)
    const filteredScaleRatio = Math.exp(filteredLog)
    const relativeDepth = filteredScaleRatio
    const appliedLog = Math.log(relativeDepth)
    const velocity = dtSeconds > 0 ? (appliedLog - this.lastAppliedLog) / dtSeconds : 0
    this.estimate = {
      timestampMs: evidence.timestampMs,
      rawPalmScale,
      baselinePalmScale: this.baselinePalmScale,
      scaleRatio,
      filteredScaleRatio,
      relativeDepth,
      velocity: Number.isFinite(velocity) ? velocity : 0,
      trackingValid: true,
    }
    this.lastTimestamp = evidence.timestampMs
    this.lastAppliedLog = appliedLog
    this.trace.push(this.estimate)
  }

  recordWorldZ(timestampMs: number, worldZ: number, velocity: number): void {
    this.trace.recordWorldZ(timestampMs, worldZ, velocity)
  }

  private hold(timestampMs = this.lastTimestamp ?? 0): void {
    const safeTimestamp = Number.isFinite(timestampMs) ? timestampMs : this.lastTimestamp ?? 0
    this.estimate = {
      ...this.estimate,
      timestampMs: safeTimestamp,
      velocity: 0,
      trackingValid: false,
    }
    this.lastTimestamp = safeTimestamp
    this.trace.push(this.estimate)
  }

  private addHistory(evidence: DepthEvidence): void {
    const scale = apparentPalmScale(evidence.distances, evidence.validMask, this.config.minimumSegmentDistance)
    if (!(scale > 0) || !Number.isFinite(scale)) return
    const slot = this.historyWrite
    this.timestamps[slot] = evidence.timestampMs
    this.scales[slot] = scale
    this.historyWrite = (slot + 1) % this.config.historySlots
    this.historyCount = Math.min(this.config.historySlots, this.historyCount + 1)
  }

  private buildBaseline(timestampMs: number): boolean {
    const scaleScratch = new Array<number>(this.config.historySlots)
    let count = 0
    for (let i = 0; i < this.historyCount; i += 1) {
      const slot = (this.historyWrite - 1 - i + this.config.historySlots) % this.config.historySlots
      const age = timestampMs - this.timestamps[slot]
      if (age < 0) continue
      if (age > this.config.historyAgeMs) break
      scaleScratch[count++] = this.scales[slot]
    }
    if (count < this.config.minimumBaselineSamples) return false
    this.baselinePalmScale = median(scaleScratch, count)
    if (!(this.baselinePalmScale > 0) || !Number.isFinite(this.baselinePalmScale)) return false

    return true
  }

  private validIdentity(evidence: DepthEvidence): boolean {
    return Number.isFinite(evidence.trackId) && evidence.trackId >= 0
      && Number.isFinite(evidence.timestampMs) && Number.isFinite(evidence.projectionId)
  }

  private identityChanged(evidence: DepthEvidence): boolean {
    return (this.trackId !== null && evidence.trackId !== this.trackId)
      || (this.projectionId !== null && evidence.projectionId !== this.projectionId)
  }

  private resetHistory(trackId: number | null, projectionId: number | null): void {
    this.historyWrite = 0
    this.historyCount = 0
    this.trackId = trackId
    this.projectionId = projectionId
    this.lastObservedTimestamp = null
    this.baselinePalmScale = 1
  }

  private snapshot(): DepthEstimate {
    return { ...this.estimate }
  }
}
