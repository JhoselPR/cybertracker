import { describe, expect, it, vi } from 'vitest'
import { HologramFrameLoop, type AnimationScheduler } from '../HologramFrameLoop'

function schedulerHarness() {
  let nextHandle = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const scheduler: AnimationScheduler = {
    request: vi.fn((callback) => {
      const handle = ++nextHandle
      callbacks.set(handle, callback)
      return handle
    }),
    cancel: vi.fn((handle) => { callbacks.delete(handle) }),
  }
  return { scheduler, callbacks }
}

describe('HologramFrameLoop', () => {
  it('cancels its single RAF idempotently during cleanup', () => {
    const harness = schedulerHarness()
    const loop = new HologramFrameLoop(vi.fn(), vi.fn(), vi.fn(), harness.scheduler)
    loop.start()

    loop.dispose()
    loop.dispose()

    expect(harness.scheduler.cancel).toHaveBeenCalledOnce()
    expect(harness.callbacks.size).toBe(0)
  })

  it('stops on context loss and reports the canvas fallback status', () => {
    const harness = schedulerHarness()
    const statuses: string[] = []
    const loop = new HologramFrameLoop(vi.fn(), vi.fn(), (status) => statuses.push(status), harness.scheduler)
    loop.start()

    loop.contextLost()

    expect(harness.scheduler.cancel).toHaveBeenCalledOnce()
    expect(harness.callbacks.size).toBe(0)
    expect(statuses).toEqual(['ready', 'context-lost'])
  })

  it('restores resources, reveals the canvas, and restarts exactly one RAF', () => {
    const harness = schedulerHarness()
    const restore = vi.fn()
    const statuses: string[] = []
    const loop = new HologramFrameLoop(vi.fn(), restore, (status) => statuses.push(status), harness.scheduler)
    loop.start()
    loop.contextLost()

    loop.contextRestored()

    expect(restore).toHaveBeenCalledOnce()
    expect(harness.callbacks.size).toBe(1)
    expect(harness.scheduler.request).toHaveBeenCalledTimes(2)
    expect(statuses).toEqual(['ready', 'context-lost', 'ready'])
  })

  it('falls back to failed when restoration cannot make the renderer usable', () => {
    const harness = schedulerHarness()
    const statuses: string[] = []
    const loop = new HologramFrameLoop(
      vi.fn(),
      () => { throw new Error('restore failed') },
      (status) => statuses.push(status),
      harness.scheduler,
    )
    loop.start()
    loop.contextLost()

    expect(() => loop.contextRestored()).not.toThrow()
    expect(harness.callbacks.size).toBe(0)
    expect(statuses.at(-1)).toBe('failed')
  })
})
