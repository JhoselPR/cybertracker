import type { HologramSemanticState } from '../../types/spatialInteraction'
import type { HologramStateChannel } from '../spatial-interaction'

export type PalmHologramStatus = 'initializing' | 'ready' | 'context-lost' | 'failed'

export interface PalmHologramRenderPort {
  setState(state: Readonly<HologramSemanticState>): void
  setDebug(enabled: boolean): void
  dispose(): void
}

export type PalmHologramRendererFactory = (
  canvas: HTMLCanvasElement,
  onStatus: (status: PalmHologramStatus) => void,
) => PalmHologramRenderPort

export type PalmHologramRendererLoader = () => Promise<PalmHologramRendererFactory>

const loadRenderer: PalmHologramRendererLoader = async () => {
  const { PalmHologramRenderer } = await import('./PalmHologramRenderer')
  return (canvas, onStatus) => new PalmHologramRenderer(canvas, onStatus)
}

interface CanvasOwner {
  token: symbol
  revoke(): void
}

const canvasOwners = new WeakMap<HTMLCanvasElement, CanvasOwner>()

export interface PalmHologramConnection {
  setDebug(enabled: boolean): void
  dispose(): void
}

/** Subscribes before loading Three so the renderer starts with the latest pose, including null. */
export function connectPalmHologram(
  canvas: HTMLCanvasElement,
  channel: HologramStateChannel,
  initialDebug: boolean,
  loader: PalmHologramRendererLoader = loadRenderer,
  onStatus: (status: PalmHologramStatus) => void = () => undefined,
): PalmHologramConnection {
  const token = Symbol('palm-hologram-owner')
  let active = true
  let debug = initialDebug
  let latestState = channel.getSnapshot()
  let renderer: PalmHologramRenderPort | null = null

  const ownsCanvas = () => active && canvasOwners.get(canvas)?.token === token
  const publishStatus = (status: PalmHologramStatus) => {
    if (ownsCanvas()) onStatus(status)
  }
  const dispose = () => {
    if (!active) return
    active = false
    if (canvasOwners.get(canvas)?.token === token) canvasOwners.delete(canvas)
    unsubscribe()
    renderer?.dispose()
    renderer = null
  }

  canvasOwners.get(canvas)?.revoke()
  canvasOwners.set(canvas, { token, revoke: dispose })
  const unsubscribe = channel.subscribe((state) => {
    if (!ownsCanvas()) return
    latestState = state
    renderer?.setState(state)
  })

  publishStatus('initializing')
  void loader().then((factory) => {
    if (!ownsCanvas()) return
    const loadedRenderer = factory(canvas, publishStatus)
    if (!ownsCanvas()) {
      loadedRenderer.dispose()
      return
    }
    renderer = loadedRenderer
    renderer.setDebug(debug)
    renderer.setState(latestState)
  }).catch((error: unknown) => {
    if (!ownsCanvas()) return
    publishStatus('failed')
    console.warn('Palm hologram renderer is unavailable', error)
  })

  return {
    setDebug(enabled) {
      if (!ownsCanvas()) return
      debug = enabled
      renderer?.setDebug(enabled)
    },
    dispose,
  }
}
