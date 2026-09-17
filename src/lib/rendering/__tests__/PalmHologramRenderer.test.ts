import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { PalmHologramRenderer } from '../PalmHologramRenderer'
import { createInitialHologramState } from '../../spatial-interaction/SpatialInteractionEngine'

const mocks = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }))
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  return {
    ...actual,
    WebGLRenderer: class {
      setClearColor() {}
      setPixelRatio() {}
      setSize() {}
      render = mocks.render
      dispose = mocks.dispose
    },
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function harness(dev: boolean) {
  vi.stubEnv('DEV', dev)
  let tick: FrameRequestCallback = () => undefined
  const request = vi.fn((callback: FrameRequestCallback) => { tick = callback; return 1 })
  const cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), devicePixelRatio: 1 })
  const canvas = {
    getContext: () => ({ getContextAttributes: () => ({}) }),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), clientWidth: 1000, clientHeight: 1000,
  } as unknown as HTMLCanvasElement
  const renderer = new PalmHologramRenderer(canvas, vi.fn())
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6)
  renderer.setState({ ...createInitialHologramState(), visible: true, opacity: 1,
    transform: { position: { x: 0, y: 0, z: 0 }, quaternion: { x: q.x, y: q.y, z: q.z, w: q.w }, scale: 1 },
  })
  const render = () => {
    tick(performance.now() + 1000)
    return mocks.render.mock.calls.at(-1)![0] as THREE.Scene
  }
  const axes = (scene: THREE.Scene) => {
    const result: THREE.AxesHelper[] = []
    scene.traverse((object) => { if (object instanceof THREE.AxesHelper) result.push(object) })
    return result
  }
  return { renderer, render, axes, q, request, cancel }
}

describe('PalmHologramRenderer debug axes without WebGL', () => {
  it('creates axes lazily, follows only the semantic root, toggles without another RAF, and disposes once', () => {
    const h = harness(true)
    expect(h.axes(h.render())).toHaveLength(0)
    const calls = h.request.mock.calls.length
    h.renderer.setDebug(true)
    expect(h.request).toHaveBeenCalledTimes(calls)
    const scene = h.render()
    const [axes] = h.axes(scene)
    expect(axes).toBeDefined()
    expect(axes.parent?.visible).toBe(true)
    scene.updateMatrixWorld(true)
    expect(axes.getWorldQuaternion(new THREE.Quaternion()).angleTo(h.q)).toBeLessThan(1e-7)
    const geometryDispose = vi.spyOn(axes.geometry, 'dispose')
    const materials = Array.isArray(axes.material) ? axes.material : [axes.material]
    const materialDisposals = materials.map((material) => vi.spyOn(material, 'dispose'))
    h.renderer.setDebug(false)
    expect(axes.parent?.visible).toBe(false)
    h.renderer.setDebug(true)
    expect(h.axes(h.render())).toEqual([axes])
    h.renderer.dispose()
    h.renderer.dispose()
    h.renderer.setDebug(true)
    expect(geometryDispose).toHaveBeenCalledOnce()
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce())
    expect(h.cancel).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it('never constructs or displays debug axes in production even when requested', () => {
    const h = harness(false)
    h.renderer.setDebug(true)
    const scene = h.render()
    expect(h.axes(scene)).toHaveLength(0)
    const root = scene.children[0]
    expect(root.children[3].children).toHaveLength(0)
    expect(root.children[3].visible).toBe(false)
    h.renderer.dispose()
  })
})
