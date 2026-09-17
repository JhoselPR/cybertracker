import { describe, expect, it } from 'vitest'
import type { InteractionEndReason, InteractionEvent, InteractionFrame } from '../../../types/interaction'
import type { SpatialHandPose, SpatialQuaternion } from '../../../types/spatial'
import { extractDepthEvidence, extractSpatialHandPose } from '../../spatial/extractSpatialHandPose'
import { projectionContext, spatialHand } from '../../spatial/__tests__/fixtures'
import { quaternionAngularDistance } from '../../spatial/math'
import { SpatialInteractionEngine } from '../SpatialInteractionEngine'
import { DepthEstimator } from '../depth'

const identity = { x: 0, y: 0, z: 0, w: 1 }
const turned = { x: 0, y: Math.sin(Math.PI / 12), z: 0, w: Math.cos(Math.PI / 12) }
const center = { x: 0.5, y: 0.5 }
const velocity = { x: 0, y: 0, magnitude: 0 }
const anchor: SpatialHandPose = {
  ...extractSpatialHandPose(spatialHand(10), 0, projectionContext)!,
  anchor: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, scale: 0.2, quaternion: identity,
}

function harness() {
  const engine = new SpatialInteractionEngine(undefined, new DepthEstimator({ debugEnabled: true }))
  let timestampMs = 0
  function run(type?: 'pinchstart' | 'pinchmove' | 'pinchend', q: SpatialQuaternion | null = identity, options: {
    reason?: InteractionEndReason
    poseTrack?: number
    primaryTrack?: number
    stale?: boolean
    poseAge?: number
    scale?: number
    pointerX?: number
    noDepth?: boolean
  } = {}) {
    timestampMs += 16
    const position = { ...center, x: options.pointerX ?? 0.5 }
    const events: InteractionEvent[] = type ? [{ type, timestampMs, position, velocity,
      ...(type === 'pinchend' ? { reason: options.reason ?? 'released' } : {}),
    } as InteractionEvent] : []
    const frame: InteractionFrame = {
      timestampMs, primaryTrackId: options.primaryTrack ?? 2, primaryHand: { trackId: options.primaryTrack ?? 2, handedness: 'Right' },
      pointer: { position, velocity, active: true, tracked: !options.stale, stale: Boolean(options.stale), anchorSource: 'pinch', quality: options.stale ? 'stale' : 'tracked' },
      state: 'pinching', drag: null, events, rawGesture: 'pinch', stableGesture: 'pinch',
      pinchEvidence: null, lastTransition: null, terminationReason: options.reason ?? null,
    }
    return engine.processFrame({
      interactionFrame: frame, anchorPose: anchor,
      interactionPose: q ? { ...anchor, quaternion: q, trackId: options.poseTrack ?? 2, timestampMs: timestampMs - (options.poseAge ?? 0) } : null,
      depthEvidence: options.noDepth ? null : extractDepthEvidence(spatialHand(2, 0.9, 'Right', { scale: options.scale ?? 1 }), timestampMs, projectionContext),
      viewport: { width: 1000, height: 1000 }, debugEnabled: true,
    })
  }
  for (let i = 0; i < 10; i += 1) run()
  return { engine, run }
}

describe('grab rotation lifecycle and depth isolation', () => {
  it.each([90, 180])('converges on an unchanged valid %i degree pose without movement events', (degrees) => {
    const target = { x: 0, y: Math.sin(degrees * Math.PI / 360), z: 0, w: Math.cos(degrees * Math.PI / 360) }
    const { run } = harness()
    const grabbed = run('pinchstart')
    let state = grabbed
    for (let frame = 0; frame < 90; frame += 1) state = run(undefined, target)
    expect(quaternionAngularDistance(state.transform!.quaternion, target)).toBeLessThanOrEqual(0.01)
    expect(state.transform!.position).toEqual(grabbed.transform!.position)
    expect(state.transform!.scale).toBe(grabbed.transform!.scale)
    expect(state.debug.rotation.state).toBe('valid')
    expect(state.debug.rotation.inputEvents).toEqual([])
    expect(state.debug.rotation.handRotation).toEqual(target)
    expect(state.debug.rotation.baselineHandRotation).toEqual(identity)
    expect(state.debug.rotation.targetObjectRotation).toEqual(target)
    expect(state.debug.rotation.appliedObjectRotation).toEqual(state.transform!.quaternion)
    expect(state.debug.rotation.remainingAngleToTarget).toBeLessThanOrEqual(0.01)
    expect(state.debug.rotation.rawDeltaMs).toBe(16)
    expect(state.debug.rotation.effectiveDeltaMs).toBe(16)
    expect(state.debug.rotation.maxAngularStep).toBeCloseTo(0.096, 12)
  })

  it('tracks a slow zero-to-90-degree pose without movement events', () => {
    const { run } = harness()
    const grabbed = run('pinchstart')
    let state = grabbed
    for (let degrees = 1; degrees <= 90; degrees += 1) {
      state = run(undefined, { x: 0, y: Math.sin(degrees * Math.PI / 360), z: 0, w: Math.cos(degrees * Math.PI / 360) })
    }
    const target = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }
    for (let frame = 0; frame < 90; frame += 1) state = run(undefined, target)
    expect(quaternionAngularDistance(state.transform!.quaternion, target)).toBeLessThanOrEqual(0.01)
    expect(state.transform!.position).toEqual(grabbed.transform!.position)
  })

  it('ignores an eventless sub-deadzone pose change', () => {
    const { run } = harness()
    run('pinchstart')
    const angle = 0.005
    const held = run(undefined, { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
    expect(held.transform!.quaternion).toEqual(identity)
    expect(held.debug.rotation.holdReason).toBe('within-deadzone')
    expect(held.debug.rotation.angularVelocity).toBe(0)
  })

  it('diagnoses sub-deadzone incoming changes with large outstanding error', () => {
    const { run } = harness()
    run('pinchstart')
    let previous = identity
    for (let frame = 0; frame < 5; frame += 1) {
      const degrees = 90 + frame * 0.1
      const target = { x: 0, y: Math.sin(degrees * Math.PI / 360), z: 0, w: Math.cos(degrees * Math.PI / 360) }
      const state = run('pinchmove', target)
      const step = quaternionAngularDistance(previous, state.transform!.quaternion)
      expect(step).toBeCloseTo(0.096, 8)
      previous = state.transform!.quaternion
    }
  })

  it('has no grab jump, preserves a mid-convergence rotation on release, and regrabs with a fresh hand baseline', () => {
    const { run } = harness()
    const initial = run('pinchstart')
    expect(initial.grabbed).toBe(true)
    expect(initial.transform?.quaternion).toEqual(identity)
    const rotated = run(undefined, turned)
    expect(quaternionAngularDistance(rotated.transform!.quaternion, turned)).toBeGreaterThan(0.01)
    const released = run('pinchend', null)
    expect(released.mode).toBe('free')
    expect(released.transform).toEqual(rotated.transform)
    expect(released.debug.rotation.initialHandQuaternion).toBeNull()
    const newHand = { x: 1, y: 0, z: 0, w: 0 }
    const regrab = run('pinchstart', newHand)
    expect(regrab.grabbed).toBe(true)
    expect(regrab.transform).toEqual(released.transform)
    expect(regrab.debug.rotation.initialHandQuaternion).toEqual(newHand)
    const unchanged = run('pinchmove', newHand)
    expect(unchanged.transform!.quaternion).toEqual(regrab.transform!.quaternion)
    expect(unchanged.transform!.scale).toBe(regrab.transform!.scale)
    expect(unchanged.transform!.position.x).toBeCloseTo(regrab.transform!.position.x, 12)
    expect(unchanged.transform!.position.y).toBeCloseTo(regrab.transform!.position.y, 12)
    expect(unchanged.transform!.position.z).toBeCloseTo(regrab.transform!.position.z, 12)
  })

  it.each(['tracking_lost', 'primary_changed', 'geometry_changed', 'gesture_ambiguous'] as const)(
    'preserves the final rotated transform on %s cancellation', (reason) => {
      const { run } = harness()
      run('pinchstart')
      const moved = run('pinchmove', turned)
      const cancelled = run('pinchend', null, { reason })
      expect(cancelled.mode).toBe('free')
      expect(cancelled.transform).toEqual(moved.transform)
      expect(cancelled.events).toContainEqual(expect.objectContaining({ type: 'grabcancel', reason }))
      expect(cancelled.debug.rotation.initialHandQuaternion).toBeNull()
    },
  )

  it('captures the first valid orientation after an orientation-less grab without a jump', () => {
    const { run } = harness()
    const grabbed = run('pinchstart', null)
    expect(grabbed.grabbed).toBe(true)
    expect(grabbed.debug.rotation.initialHandQuaternion).toBeNull()
    const first = run('pinchmove', turned)
    expect(first.transform?.quaternion).toEqual(grabbed.transform?.quaternion)
    expect(quaternionAngularDistance(first.debug.rotation.initialHandQuaternion!, turned)).toBeLessThan(1e-7)
  })

  it.each([
    { q: null, options: {}, state: 'held' },
    { q: { x: NaN, y: 0, z: 0, w: 1 }, options: {}, state: 'invalid' },
    { q: identity, options: { poseTrack: 3 }, state: 'invalid' },
    { q: identity, options: { primaryTrack: 3 }, state: 'invalid' },
    { q: identity, options: { poseAge: 16 }, state: 'invalid' },
    { q: identity, options: { stale: true }, state: 'invalid' },
  ] as const)('holds instead of continuing toward a stale target for invalid pose case %#', ({ q, options, state }) => {
    const { run } = harness()
    run('pinchstart')
    const moved = run(undefined, turned)
    const held = run(undefined, q, options)
    expect(held.transform?.quaternion).toEqual(moved.transform?.quaternion)
    expect(held.debug.rotation.state).toBe(state)
    expect(held.debug.rotation.angularVelocity).toBe(0)
  })

  it('does not gate rotation on depth evidence or translation on bad orientation', () => {
    const { run } = harness()
    run('pinchstart')
    const rotated = run('pinchmove', turned, { noDepth: true })
    expect(rotated.transform?.quaternion).not.toEqual(identity)
    const moved = run('pinchmove', { x: NaN, y: 0, z: 0, w: 1 }, { pointerX: 0.6 })
    expect(moved.transform?.quaternion).toEqual(rotated.transform?.quaternion)
    expect(moved.transform?.position.x).not.toBe(rotated.transform?.position.x)
    expect(moved.debug.rotation.state).toBe('invalid')
  })

  it('produces identical XYZ, scale, depth estimates and complete depth traces with rotation enabled or absent', () => {
    const rotating = harness()
    const stationary = harness()
    rotating.run('pinchstart')
    stationary.run('pinchstart', null)
    for (let i = 0; i < 120; i += 1) {
      const options = { scale: 1 + Math.sin(i / 20) * 0.15, pointerX: 0.5 + Math.sin(i / 30) * 0.04 }
      const a = rotating.run('pinchmove', i % 17 === 0 ? null : turned, options)
      const b = stationary.run('pinchmove', null, options)
      expect(a.transform?.position).toEqual(b.transform?.position)
      expect(a.transform?.scale).toBe(b.transform?.scale)
      expect(a.debug.depth).toEqual(b.debug.depth)
      expect(a.events).toEqual(b.events)
    }
    expect(rotating.engine.exportDepthTraceJSON()).toEqual(stationary.engine.exportDepthTraceJSON())
  })

  it('clears rotation capture on reset and can grab again without retained hand state', () => {
    const { engine, run } = harness()
    run('pinchstart')
    run('pinchmove', turned)
    expect(engine.reset().debug.rotation.initialHandQuaternion).toBeNull()
    const fresh = run('pinchstart', turned)
    expect(fresh.transform?.quaternion).toEqual(identity)
    expect(quaternionAngularDistance(fresh.debug.rotation.initialHandQuaternion!, turned)).toBeLessThan(1e-7)
  })
})
