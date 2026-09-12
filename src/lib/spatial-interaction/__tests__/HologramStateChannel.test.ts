import { describe, expect, it, vi } from 'vitest'
import { HologramStateChannel } from '../HologramStateChannel'
import { createInitialHologramState } from '../SpatialInteractionEngine'

describe('HologramStateChannel', () => {
  it('publishes cloned semantic state synchronously and clears visibility on dispose', () => {
    const channel = new HologramStateChannel(createInitialHologramState())
    const states: boolean[] = []
    channel.subscribe((state) => states.push(state.visible))
    const visible = createInitialHologramState(1)
    visible.visible = true
    visible.transform = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, scale: 1 }
    channel.publish(visible)
    visible.transform.position.x = 99
    expect(channel.getSnapshot().transform?.position.x).toBe(0)
    channel.dispose()
    expect(states).toEqual([false, true, false])
  })

  it('isolates subscriber failures', () => {
    const channel = new HologramStateChannel(createInitialHologramState())
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    channel.subscribe(() => { throw new Error('subscriber') })
    const healthy = vi.fn()
    channel.subscribe(healthy)
    channel.publish(createInitialHologramState(1))
    expect(healthy).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })
})
