import { describe, expect, it, vi } from 'vitest'
import type { HologramSemanticState } from '../../../types/spatialInteraction'
import { createInitialHologramState, HologramStateChannel } from '../../spatial-interaction'
import {
  connectPalmHologram,
  type PalmHologramRenderPort,
  type PalmHologramRendererFactory,
  type PalmHologramRendererLoader,
  type PalmHologramStatus,
} from '../connectPalmHologram'

const state = (trackId: number): HologramSemanticState => ({
  ...createInitialHologramState(trackId),
  anchorTrackId: trackId,
  visible: true,
  opacity: 1,
  transform: { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, scale: 1 },
})

const channel = () => new HologramStateChannel(createInitialHologramState())

function deferredLoader() {
  let resolvePromise!: (factory: PalmHologramRendererFactory) => void
  const loader: PalmHologramRendererLoader = () => new Promise((resolve) => { resolvePromise = resolve })
  return { loader, resolve: (factory: PalmHologramRendererFactory) => resolvePromise(factory) }
}

const renderer = (): PalmHologramRenderPort => ({
  setState: vi.fn(),
  setDebug: vi.fn(),
  dispose: vi.fn(),
})

describe('connectPalmHologram', () => {
  it('subscribes before loading and gives the renderer only the latest final semantic state', async () => {
    const states = channel()
    const pending = deferredLoader()
    const connection = connectPalmHologram({} as HTMLCanvasElement, states, false, pending.loader)
    states.publish(state(1))
    states.publish(createInitialHologramState())
    states.publish(state(2))
    const loaded = renderer()
    pending.resolve(() => loaded)
    await Promise.resolve()

    expect(loaded.setDebug).toHaveBeenCalledWith(false)
    expect(loaded.setState).toHaveBeenCalledOnce()
    expect(loaded.setState).toHaveBeenCalledWith(expect.objectContaining({ anchorTrackId: 2 }))
    states.publish(createInitialHologramState())
    expect(loaded.setState).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }))
    connection.dispose()
  })

  it('preserves debug changes while loading', async () => {
    const pending = deferredLoader()
    const connection = connectPalmHologram(
      {} as HTMLCanvasElement,
      channel(),
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
    const states = channel()
    const pending = deferredLoader()
    const connection = connectPalmHologram({} as HTMLCanvasElement, states, false, pending.loader)
    connection.dispose()
    states.publish(state(3))
    const factory = vi.fn(() => renderer())
    pending.resolve(factory)
    await Promise.resolve()
    expect(factory).not.toHaveBeenCalled()
  })

  it('allows only the current setup on one canvas to become active', async () => {
    const canvas = {} as HTMLCanvasElement
    const states = channel()
    const stalePending = deferredLoader()
    const currentPending = deferredLoader()
    const staleFactory = vi.fn(() => renderer())
    const currentRenderer = renderer()
    const currentFactory = vi.fn(() => currentRenderer)

    const stale = connectPalmHologram(canvas, states, false, stalePending.loader)
    stale.dispose()
    const current = connectPalmHologram(canvas, states, false, currentPending.loader)
    stalePending.resolve(staleFactory)
    currentPending.resolve(currentFactory)
    await Promise.resolve()

    expect(staleFactory).not.toHaveBeenCalled()
    expect(currentFactory).toHaveBeenCalledOnce()
    current.dispose()
  })

  it('prevents a superseded generation from mutating or disposing the current renderer', async () => {
    const canvas = {} as HTMLCanvasElement
    const states = channel()
    const firstPending = deferredLoader()
    const secondPending = deferredLoader()
    const first = connectPalmHologram(canvas, states, false, firstPending.loader)
    const currentRenderer = renderer()
    const current = connectPalmHologram(canvas, states, false, secondPending.loader)
    secondPending.resolve(() => currentRenderer)
    await Promise.resolve()

    first.setDebug(true)
    first.dispose()
    states.publish(state(4))

    expect(currentRenderer.setDebug).toHaveBeenCalledTimes(1)
    expect(currentRenderer.setState).toHaveBeenLastCalledWith(expect.objectContaining({ anchorTrackId: 4 }))
    expect(currentRenderer.dispose).not.toHaveBeenCalled()
    current.dispose()
  })

  it('disposes the active renderer exactly once', async () => {
    const pending = deferredLoader()
    const loaded = renderer()
    const connection = connectPalmHologram(
      {} as HTMLCanvasElement,
      channel(),
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
      channel(),
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
