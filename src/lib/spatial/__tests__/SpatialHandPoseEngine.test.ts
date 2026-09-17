import { describe, expect, it } from 'vitest'
import { SpatialHandPoseEngine } from '../SpatialHandPoseEngine'
import { projectionContext, spatialFrame, spatialHand } from './fixtures'
import { extractSpatialHandPose } from '../extractSpatialHandPose'

describe('SpatialHandPoseEngine', () => {
  it('requires a stable open palm at the configured threshold', () => {
    const engine = new SpatialHandPoseEngine({ confidenceThreshold: 0.72 })
    expect(engine.processFrame(spatialFrame(0, [spatialHand(1, 0.719)]), projectionContext)).toBeNull()
    expect(engine.processFrame(spatialFrame(16, [spatialHand(1, 0.72)]), projectionContext)?.trackId).toBe(1)
    const fist = spatialHand(1, 0.99)
    fist.stableGesture = { ...fist.stableGesture, gesture: 'fist' }
    expect(engine.processFrame(spatialFrame(32, [fist]), projectionContext)).toBeNull()
  })

  it('selects highest stable confidence then lowest track id deterministically', () => {
    const engine = new SpatialHandPoseEngine()
    expect(engine.processFrame(spatialFrame(0, [
      spatialHand(4, 0.8),
      spatialHand(3, 0.91),
      spatialHand(2, 0.91),
    ]), projectionContext)?.trackId).toBe(2)
  })

  it('retains the current valid track instead of teleporting to a stronger candidate', () => {
    const engine = new SpatialHandPoseEngine()
    expect(engine.processFrame(spatialFrame(0, [spatialHand(7, 0.8)]), projectionContext)?.trackId).toBe(7)
    expect(engine.processFrame(spatialFrame(16, [spatialHand(7, 0.75), spatialHand(2, 0.99)]), projectionContext)?.trackId).toBe(7)
    expect(engine.processFrame(spatialFrame(32, [spatialHand(2, 0.99)]), projectionContext)?.trackId).toBe(2)
  })

  it('falls back to the ranked candidate when retained geometry becomes invalid', () => {
    const engine = new SpatialHandPoseEngine()
    engine.processFrame(spatialFrame(0, [spatialHand(7, 0.8)]), projectionContext)
    const invalidRetained = spatialHand(7, 0.95)
    invalidRetained.landmarks = []
    expect(engine.processFrame(spatialFrame(16, [invalidRetained, spatialHand(2, 0.9)]), projectionContext)?.trackId).toBe(2)
  })

  it('publishes invisible null semantics when pose geometry is invalid', () => {
    const engine = new SpatialHandPoseEngine()
    const hand = spatialHand()
    hand.landmarks = []
    expect(engine.processFrame(spatialFrame(0, [hand]), projectionContext)).toBeNull()
  })

  it('keeps the anchor open palm distinct from the primary interaction-hand metric', () => {
    const engine = new SpatialHandPoseEngine()
    const anchor = spatialHand(10, 0.98)
    const primary = spatialHand(2, 0.9)
    primary.rawGesture = { ...primary.rawGesture, gesture: 'pinch' }
    primary.stableGesture = { ...primary.stableGesture, gesture: 'pinch' }
    const semantic = engine.processSemanticFrame(spatialFrame(0, [anchor, primary]), projectionContext, 2)
    expect(semantic.anchorPose?.trackId).toBe(10)
    expect(semantic.depthEvidence?.trackId).toBe(2)
    expect(semantic.interactionPose?.trackId).toBe(2)
    expect(engine.processSemanticFrame(spatialFrame(16, [anchor]), projectionContext, 2).interactionPose).toBeNull()
  })

  it('extracts primary pinch orientation without a confidence gate or anchor smoothing', () => {
    const engine = new SpatialHandPoseEngine()
    const primary = spatialHand(2, 0.01)
    primary.stableGesture = { ...primary.stableGesture, gesture: 'pinch' }
    engine.processSemanticFrame(spatialFrame(0, [primary]), projectionContext, 2)
    const turned = spatialHand(2, 0.01, 'Right', { rotationRad: 0.5 })
    turned.stableGesture = { ...turned.stableGesture, gesture: 'pinch' }
    const semantic = engine.processSemanticFrame(spatialFrame(16, [turned, spatialHand(10)]), projectionContext, 2)
    expect(semantic.anchorPose?.trackId).toBe(10)
    expect(semantic.interactionPose?.quaternion).toEqual(extractSpatialHandPose(turned, 16, projectionContext, null, true)?.quaternion)
    expect(engine.processSemanticFrame(spatialFrame(32, [turned]), projectionContext, null).interactionPose).toBeNull()
    engine.reset()
    expect(engine.processSemanticFrame(spatialFrame(48, []), projectionContext, 2).interactionPose).toBeNull()
  })

  it('reports degenerate interaction geometry absent on every frame instead of refreshing fallback', () => {
    const engine = new SpatialHandPoseEngine()
    expect(engine.processSemanticFrame(spatialFrame(0, [spatialHand()]), projectionContext, 1).interactionPose).not.toBeNull()
    const degenerate = spatialHand()
    degenerate.landmarks = degenerate.landmarks.map((point) => ({ ...point, y: 0.5 }))
    for (let time = 16; time < 200; time += 16) {
      expect(engine.processSemanticFrame(spatialFrame(time, [degenerate]), projectionContext, 1).interactionPose).toBeNull()
    }
  })
})
