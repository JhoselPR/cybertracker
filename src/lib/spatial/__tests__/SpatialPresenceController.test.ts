import { describe, expect, it } from 'vitest'
import { SpatialPresenceController } from '../SpatialPresenceController'
import { spatialHand, projectionContext } from './fixtures'
import { extractSpatialHandPose } from '../extractSpatialHandPose'

const pose = extractSpatialHandPose(spatialHand(), 0, projectionContext)!

describe('SpatialPresenceController', () => {
  it('dwells before appearance and then fades into view', () => {
    const presence = new SpatialPresenceController()
    presence.setTarget(pose, 0)
    expect(presence.sample(79).visible).toBe(false)
    expect(presence.sample(150).opacity).toBeGreaterThan(0)
    expect(presence.sample(220).opacity).toBe(1)
  })

  it('holds through disappearance grace, then fades opacity and scale', () => {
    const presence = new SpatialPresenceController()
    presence.setTarget(pose, 0)
    expect(presence.sample(220).opacity).toBe(1)
    presence.setTarget(null, 220)
    expect(presence.sample(339).opacity).toBe(1)
    const fading = presence.sample(410)
    expect(fading.opacity).toBeGreaterThan(0)
    expect(fading.opacity).toBeLessThan(1)
    expect(fading.scaleMultiplier).toBeLessThan(1)
    expect(presence.sample(481).visible).toBe(false)
  })

  it('recovers during grace without flicker and dwells again on track switch', () => {
    const presence = new SpatialPresenceController()
    presence.setTarget(pose, 0)
    presence.sample(220)
    presence.setTarget(null, 220)
    presence.setTarget({ ...pose, timestampMs: 280 }, 280)
    expect(presence.sample(280).opacity).toBe(1)
    presence.setTarget({ ...pose, trackId: 2, timestampMs: 300 }, 300)
    expect(presence.sample(350).visible).toBe(false)
  })
})
