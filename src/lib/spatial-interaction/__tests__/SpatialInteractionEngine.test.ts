import { describe, expect, it } from 'vitest'
import type { InteractionEndReason, InteractionEvent, InteractionFrame, Position2D } from '../../../types/interaction'
import type { SpatialHandPose } from '../../../types/spatial'
import type { DepthEvidence } from '../depth'
import { SpatialInteractionEngine } from '../SpatialInteractionEngine'
import { DEPTH_CONFIG, DepthEstimator } from '../depth'
import { HOLOGRAM_CAMERA } from '../camera'

const viewport = { width: 1000, height: 1000 }
const velocity = { x: 0, y: 0, magnitude: 0 }
const pose: SpatialHandPose = {
  timestampMs: 0,
  trackId: 10,
  handedness: 'Left',
  confidence: 0.95,
  center: { x: 0.5, y: 0.5 },
  anchor: { x: 0, y: 0, z: 0 },
  scale: 0.2,
  normal: { x: 0, y: 0, z: 1 },
  basis: {
    x: { x: 1, y: 0, z: 0 },
    y: { x: 0, y: 1, z: 0 },
    z: { x: 0, y: 0, z: 1 },
  },
  quaternion: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
}
const metric = (scale = 1): DepthEvidence => ({
  trackId: 2,
  timestampMs: 0,
  projectionId: 1,
  distances: [0.2 * scale, 0.3 * scale, 0.35 * scale, 0.4 * scale, 0.12 * scale, 0.13 * scale, 0.14 * scale, 0.32 * scale],
  validMask: 0xff,
  palmZ: null,
  visibility: null,
})

function event(type: 'pinchstart' | 'pinchmove', position: Position2D): InteractionEvent
function event(type: 'pinchend' | 'dragend', position: Position2D, reason: InteractionEndReason): InteractionEvent
function event(type: InteractionEvent['type'], position: Position2D, reason?: InteractionEndReason): InteractionEvent {
  if (type === 'pinchend') return { type, position, velocity, timestampMs: 0, reason: reason! }
  if (type === 'dragend') return {
    type, position, velocity, timestampMs: 0, reason: reason!,
    drag: { startPosition: position, currentPosition: position, delta: { x: 0, y: 0 }, totalDelta: { x: 0, y: 0 }, distance: 0, pathLength: 0, durationMs: 0 },
  }
  return { type, position, velocity, timestampMs: 0 } as InteractionEvent
}

function frame(timestampMs: number, position: Position2D | null, events: InteractionEvent[] = [], options: {
  stale?: boolean
  reason?: InteractionEndReason | null
} = {}): InteractionFrame {
  return {
    timestampMs,
    primaryTrackId: 2,
    primaryHand: { trackId: 2, handedness: 'Right' },
    pointer: position ? {
      position,
      velocity,
      active: true,
      tracked: !options.stale,
      stale: Boolean(options.stale),
      anchorSource: options.stale ? 'retained' : 'pinch',
      quality: options.stale ? 'grace' : 'tracked',
    } : null,
    state: 'pinching',
    drag: null,
    events: events.map((value) => ({ ...value, timestampMs })),
    rawGesture: 'pinch',
    stableGesture: 'pinch',
    pinchEvidence: { phase: 'closed', normalizedDistance: 0.2 },
    lastTransition: null,
    terminationReason: options.reason ?? null,
  }
}

const process = (
  engine: SpatialInteractionEngine,
  interactionFrame: InteractionFrame,
  anchorPose: SpatialHandPose | null = pose,
  depthEvidence: DepthEvidence | null = metric(),
) => engine.processFrame({
  interactionFrame,
  anchorPose,
  depthEvidence: depthEvidence ? { ...depthEvidence, timestampMs: interactionFrame.timestampMs } : null,
  viewport,
  debugEnabled: false,
})

describe('SpatialInteractionEngine', () => {
  it('keeps palm-anchored ownership and the last transform through anchor loss', () => {
    const engine = new SpatialInteractionEngine()
    const initial = process(engine, frame(0, null), null)
    expect(initial.mode).toBe('palm-anchored')
    expect(initial.visible).toBe(false)

    const materialized = process(engine, frame(16, null))
    const missing = process(engine, frame(32, null), null)
    expect(missing.mode).toBe('palm-anchored')
    expect(missing.transform).toEqual(materialized.transform)
    expect(missing.visible).toBe(true)
  })

  it('can hover and grab the retained anchored transform without a current anchor pose', () => {
    const engine = new SpatialInteractionEngine()
    process(engine, frame(0, null))
    const hovered = process(engine, frame(16, { x: 0.5, y: 0.5 }), null)
    expect(hovered.mode).toBe('palm-anchored')
    expect(hovered.hovered).toBe(true)

    const grabbed = process(engine, frame(32, { x: 0.5, y: 0.5 }, [
      event('pinchstart', { x: 0.5, y: 0.5 }),
    ]), null)
    expect(grabbed.mode).toBe('grabbed')
    expect(grabbed.events.map(({ type }) => type)).toEqual(['grabstart'])
  })

  it('enters free ownership only through release or cancellation', () => {
    const releaseEngine = new SpatialInteractionEngine()
    process(releaseEngine, frame(0, { x: 0.5, y: 0.5 }))
    process(releaseEngine, frame(16, { x: 0.5, y: 0.5 }, [event('pinchstart', { x: 0.5, y: 0.5 })]), null)
    expect(process(releaseEngine, frame(32, { x: 0.5, y: 0.5 }, [
      event('pinchend', { x: 0.5, y: 0.5 }, 'released'),
    ]), null).mode).toBe('free')

    const cancelEngine = new SpatialInteractionEngine()
    process(cancelEngine, frame(0, { x: 0.5, y: 0.5 }))
    process(cancelEngine, frame(16, { x: 0.5, y: 0.5 }, [event('pinchstart', { x: 0.5, y: 0.5 })]), null)
    expect(process(cancelEngine, frame(32, { x: 0.5, y: 0.5 }, [
      event('pinchend', { x: 0.5, y: 0.5 }, 'tracking_lost'),
    ], { reason: 'tracking_lost' }), null, null).mode).toBe('free')
  })

  it('resumes palm anchoring when an open palm is reacquired before any grab', () => {
    const engine = new SpatialInteractionEngine()
    const materialized = process(engine, frame(0, null))
    process(engine, frame(16, null), null)
    const reacquiredPose = { ...pose, timestampMs: 32, anchor: { x: 0.4, y: 0, z: 0 } }
    const reacquired = process(engine, frame(32, null), reacquiredPose)
    expect(reacquired.mode).toBe('palm-anchored')
    expect(reacquired.transform?.position.x).not.toBe(materialized.transform?.position.x)
    expect(reacquired.anchorTrackId).toBe(reacquiredPose.trackId)
  })

  it('emits enter once, retains hover through exit hysteresis, then leaves', () => {
    const engine = new SpatialInteractionEngine()
    const entered = process(engine, frame(0, { x: 0.5, y: 0.5 }))
    expect(entered.events.map(({ type }) => type)).toEqual(['spatialenter'])
    const retained = process(engine, frame(16, { x: 0.67, y: 0.5 }))
    expect(retained.hovered).toBe(true)
    expect(retained.events).toHaveLength(0)
    const left = process(engine, frame(32, { x: 0.73, y: 0.5 }))
    expect(left.hovered).toBe(false)
    expect(left.events.map(({ type }) => type)).toEqual(['spatialleave'])
  })

  it('captures hovered pinchstart, remains captured outside the sphere, and preserves pointer offset', () => {
    const engine = new SpatialInteractionEngine()
    process(engine, frame(0, { x: 0.58, y: 0.5 }))
    const grabbed = process(engine, frame(16, { x: 0.58, y: 0.5 }, [event('pinchstart', { x: 0.58, y: 0.5 })]))
    expect(grabbed.mode).toBe('grabbed')
    expect(grabbed.events.map(({ type }) => type)).toEqual(['grabstart'])
    const moved = process(engine, frame(32, { x: 0.95, y: 0.5 }, [event('pinchmove', { x: 0.68, y: 0.5 })]), null)
    expect(moved.grabbed).toBe(true)
    expect(moved.transform?.position.x).toBeCloseTo(0.373, 2)
    expect(moved.debug.grabOffset?.x).toBeCloseTo(-0.16, 5)
  })

  it('maps clamped palm-scale ratio to depth without changing scale or rotation', () => {
    const engine = new SpatialInteractionEngine()
    for (let i = 0; i < 10; i += 1) process(engine, frame(i * 16, { x: 0.5, y: 0.5 }))
    const grabbed = process(engine, frame(160, { x: 0.5, y: 0.5 }, [event('pinchstart', { x: 0.5, y: 0.5 })]))
    let moved = grabbed
    for (let i = 1; i <= 8; i += 1) {
      moved = process(engine, frame(160 + i * 16, { x: 0.5, y: 0.5 }, [event('pinchmove', { x: 0.5, y: 0.5 })]), null, metric(1 + i * 0.012))
    }
    expect(moved.debug.depthRatio).toBeGreaterThan(1)
    expect(moved.transform!.position.z).toBeGreaterThan(grabbed.transform!.position.z)
    expect(moved.transform!.scale).toBe(grabbed.transform!.scale)
    expect(moved.transform!.quaternion).toEqual(grabbed.transform!.quaternion)
  })

  it('keeps world Z velocity bounded during sustained movement', () => {
    const engine = new SpatialInteractionEngine()
    for (let i = 0; i < 10; i += 1) process(engine, frame(i * 16, { x: 0.5, y: 0.5 }))
    let state = process(engine, frame(160, { x: 0.5, y: 0.5 }, [event('pinchstart', { x: 0.5, y: 0.5 })]))
    let previousZ = state.transform!.position.z
    for (let i = 1; i <= 20; i += 1) {
      state = process(engine, frame(160 + i * 16, { x: 0.5, y: 0.5 }, [event('pinchmove', { x: 0.5, y: 0.5 })]), null, metric(1.35))
      const currentZ = state.transform!.position.z
      expect(Math.abs(currentZ - previousZ)).toBeLessThanOrEqual(DEPTH_CONFIG.maximumWorldZVelocity * 0.016 + 1e-9)
      previousZ = currentZ
    }
    expect(state.debug.depthRatio).toBeGreaterThan(1)
  })

  it('ends exactly once on repeated dragend and pinchend and preserves the released transform', () => {
    const engine = new SpatialInteractionEngine()
    process(engine, frame(0, { x: 0.5, y: 0.5 }))
    process(engine, frame(16, { x: 0.5, y: 0.5 }, [event('pinchstart', { x: 0.5, y: 0.5 })]))
    const released = process(engine, frame(32, { x: 0.6, y: 0.5 }, [
      event('dragend', { x: 0.6, y: 0.5 }, 'released'),
      event('pinchend', { x: 0.6, y: 0.5 }, 'released'),
    ]), null)
    expect(released.mode).toBe('free')
    expect(released.events.filter(({ type }) => type === 'grabend')).toHaveLength(1)
    const preserved = released.transform
    const repeated = process(engine, frame(48, { x: 0.6, y: 0.5 }, [event('pinchend', { x: 0.6, y: 0.5 }, 'released')]), null)
    expect(repeated.events.filter(({ type }) => type === 'grabend')).toHaveLength(0)
    expect(repeated.transform).toEqual(preserved)
  })

  it('holds capture through stale grace and cancels only on the engine cancellation event', () => {
    const engine = new SpatialInteractionEngine()
    process(engine, frame(0, { x: 0.5, y: 0.5 }))
    process(engine, frame(16, { x: 0.5, y: 0.5 }, [event('pinchstart', { x: 0.5, y: 0.5 })]))
    const grace = process(engine, frame(32, { x: 0.5, y: 0.5 }, [], { stale: true }), null, null)
    expect(grace.mode).toBe('grabbed')
    const cancellationFrame = frame(300, { x: 0.5, y: 0.5 }, [
      event('pinchend', { x: 0.5, y: 0.5 }, 'tracking_lost'),
    ], { reason: 'tracking_lost' })
    cancellationFrame.primaryTrackId = null
    cancellationFrame.primaryHand = null
    cancellationFrame.pointer = null
    const cancelled = process(engine, cancellationFrame, null, null)
    expect(cancelled.mode).toBe('free')
    expect(cancelled.events.map(({ type }) => type)).toEqual(['grabcancel', 'spatialleave'])
    expect(cancelled.events[0].trackId).toBe(2)
    expect(cancelled.events[0].pointer).toEqual({ x: 0.5, y: 0.5 })
    expect(cancelled.events[0].ray).not.toBeNull()
    expect(cancelled.transform).toEqual(grace.transform)
  })

  it('supports repeated grabs while free and reset reattaches ownership', () => {
    const engine = new SpatialInteractionEngine()
    for (let i = 0; i < 10; i += 1) process(engine, frame(i * 16, { x: 0.5, y: 0.5 }))
    expect(process(engine, frame(160, { x: 0.5, y: 0.5 }, [event('pinchstart', { x: 0.5, y: 0.5 })])).mode).toBe('grabbed')
    expect(process(engine, frame(176, { x: 0.5, y: 0.5 }, [event('pinchend', { x: 0.5, y: 0.5 }, 'released')]), null).mode).toBe('free')
    for (let i = 1; i <= 20; i += 1) process(engine, frame(176 + i * 16, { x: 0.5, y: 0.5 }), null, metric(1.1))
    const secondGrab = process(engine, frame(512, { x: 0.5, y: 0.5 }, [event('pinchstart', { x: 0.5, y: 0.5 })]), null, metric(1.1))
    expect(secondGrab.mode).toBe('grabbed')
    let moved = secondGrab
    for (let i = 1; i <= 10; i += 1) {
      moved = process(engine, frame(512 + i * 16, { x: 0.5, y: 0.5 }, [event('pinchmove', { x: 0.5, y: 0.5 })]), null, metric(1.1 * (1 + i * 0.01)))
    }
    expect(moved.debug.depth.relativeDepth).toBeGreaterThan(1)
    expect(moved.transform!.position.z).toBeGreaterThan(secondGrab.transform!.position.z)
    expect(moved.transform!.scale).toBe(secondGrab.transform!.scale)
    const reset = engine.reset(688)
    expect(reset.mode).toBe('palm-anchored')
    expect(reset.transform).toBeNull()
  })

  it('maps inverse distance exactly and correlates loss and recovery traces with each frame', () => {
    const estimator = new DepthEstimator({ debugEnabled: true })
    const engine = new SpatialInteractionEngine(undefined, estimator)
    const center = { x: 0.5, y: 0.5 }
    const run = (timestampMs: number, events: InteractionEvent[] = [], depthEvidence: DepthEvidence | null = metric(), stale = false) => {
      const state = engine.processFrame({
        interactionFrame: frame(timestampMs, center, events, { stale }),
        anchorPose: pose,
        depthEvidence: depthEvidence ? { ...depthEvidence, timestampMs } : null,
        viewport,
        debugEnabled: true,
      })
      if (events.length || state.grabbed) {
        const entry = estimator.exportTrace().at(-1)!
        expect(entry.timestampMs).toBe(timestampMs)
        expect(entry.worldZ).toBe(state.transform!.position.z)
        expect(Object.keys(entry)).toEqual([
          'timestampMs', 'rawPalmScale', 'baselinePalmScale', 'scaleRatio',
          'filteredScaleRatio', 'relativeDepth', 'worldZ', 'velocity', 'trackingValid',
        ])
      }
      return state
    }
    for (let i = 0; i < 10; i += 1) run(i * 16)
    const grabbed = run(160, [event('pinchstart', center)])
    const moved = run(1160, [event('pinchmove', center)], metric(1.1))
    expect(moved.transform!.position.z).toBeCloseTo(HOLOGRAM_CAMERA.position.z
      - (HOLOGRAM_CAMERA.position.z - grabbed.transform!.position.z) / estimator.current().relativeDepth, 12)
    const lost = run(1176, [], null)
    expect(lost.transform).toEqual(moved.transform)
    expect(estimator.current().trackingValid).toBe(false)
    run(1192, [], metric(1.1), true)
    expect(estimator.current().trackingValid).toBe(false)
    const recovered = run(1208, [event('pinchmove', center)], metric(1.2))
    expect(estimator.current().trackingValid).toBe(true)
    expect(recovered.transform!.position.z).toBeGreaterThan(lost.transform!.position.z)
    expect(recovered.transform!.scale).toBe(grabbed.transform!.scale)
    expect(recovered.transform!.quaternion).toEqual(grabbed.transform!.quaternion)
  })
})
