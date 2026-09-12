import { describe, expect, it, vi } from 'vitest'
import { extractSpatialHandPose } from '../extractSpatialHandPose'
import { SpatialHandPoseChannel } from '../SpatialHandPoseChannel'
import { projectionContext, spatialHand } from './fixtures'

describe('SpatialHandPoseChannel', () => {
  it('delivers pose and null synchronously and supports unsubscribe', () => {
    const channel = new SpatialHandPoseChannel()
    const received: Array<number | null> = []
    const unsubscribe = channel.subscribe((pose) => received.push(pose?.trackId ?? null))
    channel.publish(extractSpatialHandPose(spatialHand(3), 0, projectionContext))
    channel.publish(null)
    unsubscribe()
    channel.publish(extractSpatialHandPose(spatialHand(4), 16, projectionContext))
    expect(received).toEqual([3, null])
  })

  it('isolates subscriber failures and clones mutable pose structures', () => {
    const channel = new SpatialHandPoseChannel()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const received = vi.fn()
    channel.subscribe(() => { throw new Error('broken') })
    channel.subscribe((pose) => {
      if (pose) pose.center.x = 99
    })
    channel.subscribe(received)
    const source = extractSpatialHandPose(spatialHand(), 0, projectionContext)!
    channel.publish(source)
    expect(received.mock.calls[0][0].center.x).toBe(source.center.x)
    expect(source.center.x).not.toBe(99)
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })
})
