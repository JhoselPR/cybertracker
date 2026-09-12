import { describe, expect, it, vi } from 'vitest'
import type { SpatialHandPose } from '../../../types/spatial'
import { SpatialHandPoseChannel } from '../../spatial'
import {
  connectPalmHologram,
  type PalmHologramRenderPort,
  type PalmHologramRendererFactory,
  type PalmHologramRendererLoader,
  type PalmHologramStatus,
} from '../connectPalmHologram'

const pose = (trackId: number): SpatialHandPose => ({
  timestampMs: trackId,
  trackId,
  handedness: 'Right',
  confidence: 0.9,
  center: { x: 0.5, y: 0.5 },
  anchor: { x: 0, y: 0, z: 0 },
  scale: 0.2,
  normal: { x: 0, y: 0, z: 1 },
  basis: {
    x: { x: 1, y: 0, z: 0 },
    y: { x: 0, y: 1, z: 0 },
    z: { x: 0, y: 0, z: 1 },
  },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
})

function deferredLoader() {
  let resolvePromise!: (factory: PalmHologramRendererFactory) => void
  const loader: PalmHologramRendererLoader = () => new Promise((resolve) => { resolvePromise = resolve })
  return { loader, resolve: (factory: PalmHologramRendererFactory) => resolvePromise(factory) }
}

const renderer = (): PalmHologramRenderPort => ({
  setPose: vi.fn(),
  setDebug: vi.fn(),
  dispose: vi.fn(),
})

describe('connectPalmHologram', () => {
  it('subscribes before loading and applies only the latest pending pose when ready', async () => {
    const channel = new SpatialHandPoseChannel()
    const pending = deferredLoader()
    const connection = connectPalmHologram({} as HTMLCanvasElement, channel, false, pending.loader)
    channel.publish(pose(1))
    channel.publish(null)
    channel.publish(pose(2))
    const loaded = renderer()
    pending.resolve(() => loaded)
    await Promise.resolve()

    expect(loaded.setDebug).toHaveBeenCalledWith(false)
    expect(loaded.setPose).toHaveBeenCalledOnce()
    expect(loaded.setPose).toHaveBeenCalledWith(expect.objectContaining({ trackId: 2 }))
    channel.publish(null)
    expect(loaded.setPose).toHaveBeenLastCalledWith(null)
    connection.dispose()
  })

  it('preserves debug changes while loading', async () => {
    const pending = deferredLoader()
    const connection = connectPalmHologram(
      {} as HTMLCanvasElement,
      new SpatialHandPoseChannel(),
      false,
      pending.loader,
    )
    connection.setDebug(true)
    const loaded = renderer()
    pending.resolve(() => loaded)
    await Promise.resolve()
    expect(loaded.setDebug).toHaveBeenCalledWith(true)
    connection.dispose()
  })

  it('does not construct a renderer when the dynamic import resolves after cleanup', async () => {
    const channel = new SpatialHandPoseChannel()
    const pending = deferredLoader()
    const connection = connectPalmHologram({} as HTMLCanvasElement, channel, false, pending.loader)
    connection.dispose()
    channel.publish(pose(3))
    const factory = vi.fn(() => renderer())
    pending.resolve(factory)
    await Promise.resolve()
    expect(factory).not.toHaveBeenCalled()
  })

  it('allows only the current setup on one canvas to become active', async () => {
    const canvas = {} as HTMLCanvasElement
    const channel = new SpatialHandPoseChannel()
    const stalePending = deferredLoader()
    const currentPending = deferredLoader()
    const staleFactory = vi.fn(() => renderer())
    const currentRenderer = renderer()
    const currentFactory = vi.fn(() => currentRenderer)

    const stale = connectPalmHologram(canvas, channel, false, stalePending.loader)
    stale.dispose()
    const current = connectPalmHologram(canvas, channel, false, currentPending.loader)
    stalePending.resolve(staleFactory)
    currentPending.resolve(currentFactory)
    await Promise.resolve()

    expect(staleFactory).not.toHaveBeenCalled()
    expect(currentFactory).toHaveBeenCalledOnce()
    current.dispose()
  })

  it('prevents a superseded generation from mutating or disposing the current renderer', async () => {
    const canvas = {} as HTMLCanvasElement
    const channel = new SpatialHandPoseChannel()
    const firstPending = deferredLoader()
    const secondPending = deferredLoader()
    const first = connectPalmHologram(canvas, channel, false, firstPending.loader)
    const currentRenderer = renderer()
    const current = connectPalmHologram(canvas, channel, false, secondPending.loader)
    secondPending.resolve(() => currentRenderer)
    await Promise.resolve()

    first.setDebug(true)
    first.dispose()
    channel.publish(pose(4))

    expect(currentRenderer.setDebug).toHaveBeenCalledTimes(1)
    expect(currentRenderer.setPose).toHaveBeenLastCalledWith(expect.objectContaining({ trackId: 4 }))
    expect(currentRenderer.dispose).not.toHaveBeenCalled()
    current.dispose()
  })

  it('disposes the active renderer exactly once', async () => {
    const pending = deferredLoader()
    const loaded = renderer()
    const connection = connectPalmHologram(
      {} as HTMLCanvasElement,
      new SpatialHandPoseChannel(),
      false,
      pending.loader,
    )
    pending.resolve(() => loaded)
    await Promise.resolve()

    connection.dispose()
    connection.dispose()
    expect(loaded.dispose).toHaveBeenCalledOnce()
  })

  it('reports initialization failure without rejecting into the application', async () => {
    const statuses: PalmHologramStatus[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const connection = connectPalmHologram(
      {} as HTMLCanvasElement,
      new SpatialHandPoseChannel(),
      false,
      async () => { throw new Error('unavailable') },
      (status) => statuses.push(status),
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(statuses).toEqual(['initializing', 'failed'])
    expect(warn).toHaveBeenCalledOnce()
    connection.dispose()
    warn.mockRestore()
  })
})
