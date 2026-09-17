import * as THREE from 'three'
import type { HologramSemanticState } from '../../types/spatialInteraction'
import { HOLOGRAM_CAMERA, PALM_HOLOGRAM_TARGET_ID } from '../spatial-interaction'
import { SpatialPresenceController } from '../spatial'
import type { PalmHologramStatus } from './connectPalmHologram'
import { HologramFrameLoop } from './HologramFrameLoop'

export class PalmHologramRenderer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(
    HOLOGRAM_CAMERA.verticalFovDegrees,
    1,
    HOLOGRAM_CAMERA.near,
    HOLOGRAM_CAMERA.far,
  )
  private readonly root = new THREE.Group()
  private readonly core = new THREE.Group()
  private readonly rings = new THREE.Group()
  private readonly orbitals = new THREE.Group()
  private readonly debug = new THREE.Group()
  private readonly presence = new SpatialPresenceController<HologramSemanticState>(() => PALM_HOLOGRAM_TARGET_ID)
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly baseOpacity = new Map<THREE.Material, number>()
  private readonly resizeObserver: ResizeObserver | null
  private readonly frameLoop: HologramFrameLoop
  private disposed = false
  private debugEnabled = false
  private renderedVisibleFrame = false

  constructor(
    private readonly canvas: HTMLCanvasElement,
    onStatus: (status: PalmHologramStatus) => void,
  ) {
    const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' })
    if (!context?.getContextAttributes()) throw new Error('WebGL2 is unavailable')
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true, powerPreference: 'low-power' })
    this.renderer.setClearColor(0x000000, 0)
    this.camera.position.set(HOLOGRAM_CAMERA.position.x, HOLOGRAM_CAMERA.position.y, HOLOGRAM_CAMERA.position.z)
    this.scene.add(this.root)
    this.root.add(this.core, this.rings, this.orbitals, this.debug)
    this.buildHologram()
    this.debug.visible = false

    this.frameLoop = new HologramFrameLoop(this.renderFrame, this.resize, onStatus)
    canvas.addEventListener('webglcontextlost', this.handleContextLost)
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored)
    window.addEventListener('resize', this.resize)
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.resize)
    this.resizeObserver?.observe(canvas)
    this.resize()
    this.frameLoop.start()
  }

  setState(state: Readonly<HologramSemanticState>): void {
    this.presence.setTarget(state.visible && state.transform ? state as HologramSemanticState : null, performance.now())
  }

  setDebug(enabled: boolean): void {
    if (this.disposed) return
    this.debugEnabled = import.meta.env.DEV && enabled
    if (this.debugEnabled && this.debug.children.length === 0) this.buildDebugGeometry()
    this.debug.visible = this.debugEnabled && this.root.visible
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.frameLoop.dispose()
    this.resizeObserver?.disconnect()
    window.removeEventListener('resize', this.resize)
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
    this.renderer.dispose()
    this.presence.reset()
  }

  private readonly handleContextLost = (): void => {
    this.frameLoop.contextLost()
  }

  private readonly handleContextRestored = (): void => {
    this.frameLoop.contextRestored()
  }

  private readonly resize = (): void => {
    if (this.disposed) return
    const width = Math.max(1, this.canvas.clientWidth)
    const height = Math.max(1, this.canvas.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private readonly renderFrame = (nowMs: number): void => {
    if (this.disposed) return
    const state = this.presence.sample(nowMs)
    this.root.visible = state.visible && Boolean(state.pose)
    if (!state.pose || !this.root.visible) {
      if (this.renderedVisibleFrame) {
        this.renderer.render(this.scene, this.camera)
        this.renderedVisibleFrame = false
      }
      return
    }

    const semantic = state.pose
    const transform = semantic.transform!
    this.root.position.set(transform.position.x, transform.position.y, transform.position.z)
    this.root.quaternion.set(
      transform.quaternion.x,
      transform.quaternion.y,
      transform.quaternion.z,
      transform.quaternion.w,
    )
    this.root.scale.setScalar(transform.scale * state.scaleMultiplier)
    this.core.scale.setScalar(semantic.grabbed ? 0.9 : 1)
    this.rings.scale.setScalar(semantic.grabbed ? 1.08 : semantic.hovered ? 1.035 : 1)
    this.debug.visible = this.debugEnabled
    this.setOpacity(state.opacity * semantic.opacity * (semantic.hovered ? 1.1 : 1))

    const seconds = nowMs / 1000
    this.core.rotation.set(seconds * 0.22, seconds * 0.34, seconds * 0.14)
    this.rings.children.forEach((ring, index) => {
      ring.rotation.z = seconds * (index % 2 === 0 ? 0.3 : -0.24) + index * 0.7
    })
    this.orbitals.rotation.z = seconds * 0.46
    this.orbitals.rotation.x = Math.sin(seconds * 0.37) * 0.2
    this.renderer.render(this.scene, this.camera)
    this.renderedVisibleFrame = true
  }

  private material(parameters: THREE.MeshBasicMaterialParameters, opacity: number): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      ...parameters,
      opacity,
    })
    this.materials.add(material)
    this.baseOpacity.set(material, opacity)
    return material
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry)
    return geometry
  }

  private buildHologram(): void {
    const cyan = 0x70f6ff
    const blue = 0x35aeea
    const amber = 0xffc86b
    this.core.add(new THREE.Mesh(
      this.geometry(new THREE.IcosahedronGeometry(0.48, 1)),
      this.material({ color: cyan, wireframe: true }, 0.72),
    ))
    this.core.add(new THREE.Mesh(
      this.geometry(new THREE.OctahedronGeometry(0.26, 0)),
      this.material({ color: blue, wireframe: true }, 0.38),
    ))
    const glow = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(0.58, 12, 8)),
      this.material({ color: blue, side: THREE.BackSide }, 0.065),
    )
    this.core.add(glow)

    const ringGeometry = this.geometry(new THREE.TorusGeometry(0.67, 0.012, 4, 48))
    ;[
      [0.18, 0.58, 0],
      [1.12, -0.32, 0.8],
      [-0.72, 0.22, 1.45],
    ].forEach(([x, y, z], index) => {
      const ring = new THREE.Mesh(ringGeometry, this.material({ color: index === 2 ? amber : cyan }, 0.44 - index * 0.06))
      ring.rotation.set(x, y, z)
      this.rings.add(ring)
    })

    const orbitalGeometry = this.geometry(new THREE.SphereGeometry(0.035, 6, 4))
    for (let index = 0; index < 5; index += 1) {
      const pivot = new THREE.Group()
      const orbital = new THREE.Mesh(orbitalGeometry, this.material({ color: index % 2 ? amber : cyan }, 0.72))
      orbital.position.x = 0.76 + (index % 2) * 0.08
      pivot.rotation.set(index * 0.56, index * 1.21, index * 0.83)
      pivot.add(orbital)
      this.orbitals.add(pivot)
    }
  }

  private buildDebugGeometry(): void {
    const line = (from: THREE.Vector3, to: THREE.Vector3, color: number): THREE.Line => {
      const geometry = this.geometry(new THREE.BufferGeometry().setFromPoints([from, to]))
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
      this.materials.add(material)
      this.baseOpacity.set(material, 0.9)
      return new THREE.Line(geometry, material)
    }
    this.debug.add(line(new THREE.Vector3(-0.72, 0, 0), new THREE.Vector3(0.72, 0, 0), 0xff5e8a))
    this.debug.add(line(new THREE.Vector3(0, -0.56, 0), new THREE.Vector3(0, 0.7, 0), 0x8dff9b))
    this.debug.add(line(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.88), 0x66aaff))
    const center = new THREE.Mesh(
      this.geometry(new THREE.SphereGeometry(0.045, 6, 4)),
      this.material({ color: 0xffffff }, 0.9),
    )
    this.debug.add(center)
    const axes = new THREE.AxesHelper(0.45)
    const axesMaterial = axes.material as THREE.Material
    axesMaterial.transparent = true
    this.materials.add(axesMaterial)
    this.baseOpacity.set(axesMaterial, 0.9)
    this.geometries.add(axes.geometry)
    this.debug.add(axes)
  }

  private setOpacity(opacity: number): void {
    for (const material of this.materials) {
      if ('opacity' in material) material.opacity = (this.baseOpacity.get(material) ?? 1) * opacity
    }
  }
}
