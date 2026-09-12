import type { SpatialHandPose, SpatialVector2 } from '../../types/spatial'
import type {
  HologramSemanticState,
  SpatialInteractionEvent,
  SpatialInteractionInputs,
  SpatialRay,
  SpatialTransform,
} from '../../types/spatialInteraction'
import { ndcToPerspectivePlane } from '../coordinates'
import { SPATIAL_POSE_POLICY } from '../spatial'
import { HOLOGRAM_CAMERA, PALM_HOLOGRAM_TARGET_ID, SPATIAL_INTERACTION_POLICY } from './camera'
import { normalizedPointerToNdc, perspectiveCameraRay, unprojectNdcAtDepth, worldPointToNdc } from './rayMath'
import { SpatialTargetRegistry } from './SpatialTargetRegistry'

interface GrabCapture {
  trackId: number
  initialPalmScale: number
  initialDistance: number
  offsetNdc: SpatialVector2
  quaternion: SpatialTransform['quaternion']
  scale: number
  startedAtMs: number
}

const copyTransform = (transform: SpatialTransform): SpatialTransform => ({
  position: { ...transform.position },
  quaternion: { ...transform.quaternion },
  scale: transform.scale,
})

export function createInitialHologramState(timestampMs = 0): HologramSemanticState {
  return {
    targetId: PALM_HOLOGRAM_TARGET_ID,
    timestampMs,
    mode: 'palm-anchored',
    interactionState: 'idle',
    transform: null,
    anchorTrackId: null,
    interactionTrackId: null,
    hovered: false,
    grabbed: false,
    visible: false,
    opacity: 1,
    cursorState: 'normal',
    events: [],
    debug: { targetId: null, ray: null, grabOffset: null, depthRatio: 1, grabDurationMs: 0, lastEvent: null },
  }
}

export class SpatialInteractionEngine {
  readonly registry: SpatialTargetRegistry
  private state = createInitialHologramState()
  private hoveredId: string | null = null
  private capture: GrabCapture | null = null

  constructor(registry = new SpatialTargetRegistry()) {
    this.registry = registry
    this.registry.register({
      id: PALM_HOLOGRAM_TARGET_ID,
      enabled: false,
      center: { x: 0, y: 0, z: 0 },
      enterRadius: 0.2,
      exitRadius: 0.24,
    })
  }

  processFrame(inputs: SpatialInteractionInputs): HologramSemanticState {
    const { interactionFrame, anchorPose, interactionMetric, viewport } = inputs
    const events: SpatialInteractionEvent[] = []
    let transform = this.state.transform ? copyTransform(this.state.transform) : null
    let mode = this.state.mode
    let ray: SpatialRay | null = null

    if (mode === 'palm-anchored' && anchorPose) transform = this.anchoredTransform(anchorPose, viewport)
    if (transform) this.syncTarget(transform)

    const pointer = interactionFrame.pointer
    const semanticPointer = pointer?.position ?? interactionFrame.events.at(-1)?.position ?? null
    if (semanticPointer) ray = perspectiveCameraRay(semanticPointer, viewport, HOLOGRAM_CAMERA.position, HOLOGRAM_CAMERA.verticalFovDegrees)

    if (mode !== 'grabbed') this.updateHover(ray, transform, interactionFrame, events)

    const pinchStart = interactionFrame.events.find((event) => event.type === 'pinchstart')
    if (this.hoveredId && transform && pinchStart && interactionFrame.primaryTrackId !== null
      && interactionMetric?.trackId === interactionFrame.primaryTrackId
      && interactionMetric.apparentPalmScale > 0) {
      const pointerNdc = normalizedPointerToNdc(pinchStart.position)
      const objectNdc = worldPointToNdc(transform.position, viewport, HOLOGRAM_CAMERA.position, HOLOGRAM_CAMERA.verticalFovDegrees)
      this.capture = {
        trackId: interactionFrame.primaryTrackId,
        initialPalmScale: interactionMetric.apparentPalmScale,
        initialDistance: HOLOGRAM_CAMERA.position.z - transform.position.z,
        offsetNdc: { x: objectNdc.x - pointerNdc.x, y: objectNdc.y - pointerNdc.y },
        quaternion: { ...transform.quaternion },
        scale: transform.scale,
        startedAtMs: interactionFrame.timestampMs,
      }
      mode = 'grabbed'
      events.push(this.event('grabstart', transform, interactionFrame, ray))
    }

    if (mode === 'grabbed' && this.capture && transform) {
      const move = interactionFrame.events.find((event) => event.type === 'pinchmove' || event.type === 'dragmove')
      if (move && interactionMetric?.trackId === this.capture.trackId && !pointer?.stale) {
        const rawRatio = interactionMetric.apparentPalmScale / this.capture.initialPalmScale
        const depthRatio = Math.max(SPATIAL_INTERACTION_POLICY.minimumDepthRatio,
          Math.min(SPATIAL_INTERACTION_POLICY.maximumDepthRatio, rawRatio))
        const distance = Math.max(SPATIAL_INTERACTION_POLICY.minimumCameraDistance,
          Math.min(SPATIAL_INTERACTION_POLICY.maximumCameraDistance, this.capture.initialDistance / depthRatio))
        const pointerNdc = normalizedPointerToNdc(move.position)
        const centerNdc = { x: pointerNdc.x + this.capture.offsetNdc.x, y: pointerNdc.y + this.capture.offsetNdc.y }
        transform = {
          position: unprojectNdcAtDepth(centerNdc, distance, viewport, HOLOGRAM_CAMERA.position, HOLOGRAM_CAMERA.verticalFovDegrees),
          quaternion: { ...this.capture.quaternion },
          scale: this.capture.scale,
        }
        this.syncTarget(transform)
        events.push({ ...this.event('grabmove', transform, interactionFrame, ray), type: 'grabmove', depthRatio })
      }

      const terminal = interactionFrame.events.find((event) => (
        event.type === 'pinchend' || event.type === 'dragend'
      ))
      if (terminal) {
        const reason = terminal.reason
        events.push(reason === 'released'
          ? this.event('grabend', transform, interactionFrame, ray)
          : { ...this.event('grabcancel', transform, interactionFrame, ray), type: 'grabcancel', reason })
        mode = 'free'
        this.capture = null
        this.updateHover(reason === 'released' ? ray : null, transform, interactionFrame, events)
      }
    }

    const grabbed = mode === 'grabbed'
    const hovered = !grabbed && this.hoveredId === PALM_HOLOGRAM_TARGET_ID
    const lastEvent = events.at(-1)?.type ?? this.state.debug.lastEvent
    const depthRatio = events.find((event) => event.type === 'grabmove')?.depthRatio ?? (grabbed ? this.state.debug.depthRatio : 1)
    this.state = {
      targetId: PALM_HOLOGRAM_TARGET_ID,
      timestampMs: interactionFrame.timestampMs,
      mode,
      interactionState: grabbed ? 'grabbed' : hovered ? 'hovering' : 'idle',
      transform,
      anchorTrackId: anchorPose?.trackId ?? null,
      interactionTrackId: interactionFrame.primaryTrackId,
      hovered,
      grabbed,
      visible: Boolean(transform),
      opacity: transform ? 1 : 0,
      cursorState: grabbed ? 'spatial-grabbed' : hovered ? 'spatial-hover' : 'normal',
      events,
      debug: {
        targetId: transform ? PALM_HOLOGRAM_TARGET_ID : null,
        ray,
        grabOffset: this.capture ? { ...this.capture.offsetNdc } : null,
        depthRatio,
        grabDurationMs: this.capture ? interactionFrame.timestampMs - this.capture.startedAtMs : 0,
        lastEvent,
      },
    }
    return structuredClone(this.state)
  }

  reset(timestampMs = 0): HologramSemanticState {
    this.capture = null
    this.hoveredId = null
    this.state = createInitialHologramState(timestampMs)
    this.registry.update(PALM_HOLOGRAM_TARGET_ID, { enabled: false })
    return structuredClone(this.state)
  }

  dispose(): void {
    this.registry.dispose()
    this.capture = null
    this.hoveredId = null
  }

  private anchoredTransform(pose: SpatialHandPose, viewport: { width: number; height: number }): SpatialTransform {
    const position = ndcToPerspectivePlane(
      pose.anchor,
      viewport.width,
      viewport.height,
      HOLOGRAM_CAMERA.position.z,
      HOLOGRAM_CAMERA.verticalFovDegrees,
    )
    const visibleHeight = 2 * HOLOGRAM_CAMERA.position.z
      * Math.tan((HOLOGRAM_CAMERA.verticalFovDegrees * Math.PI) / 360)
    const scale = pose.scale * visibleHeight
    position.x += pose.normal.x * scale * SPATIAL_POSE_POLICY.hoverScaleRatio
    position.y += pose.normal.y * scale * SPATIAL_POSE_POLICY.hoverScaleRatio
    position.z += pose.normal.z * scale * SPATIAL_POSE_POLICY.hoverScaleRatio
    return { position, quaternion: { ...pose.quaternion }, scale }
  }

  private syncTarget(transform: SpatialTransform): void {
    const enterRadius = Math.max(SPATIAL_INTERACTION_POLICY.minimumTargetRadius,
      transform.scale * SPATIAL_INTERACTION_POLICY.targetRadiusScale)
    this.registry.update(PALM_HOLOGRAM_TARGET_ID, {
      enabled: true,
      center: transform.position,
      enterRadius,
      exitRadius: enterRadius * SPATIAL_INTERACTION_POLICY.targetExitRadiusScale,
    })
  }

  private updateHover(
    ray: SpatialRay | null,
    transform: SpatialTransform | null,
    frame: SpatialInteractionInputs['interactionFrame'],
    events: SpatialInteractionEvent[],
  ): void {
    let nextId: string | null = null
    if (ray && transform) {
      const retained = this.hoveredId ? this.registry.hit(this.hoveredId, ray, 'exit') : null
      nextId = retained?.target.id ?? this.registry.nearestPositiveHit(ray, 'enter')?.target.id ?? null
    }
    if (nextId === this.hoveredId) return
    if (this.hoveredId && transform) events.push(this.event('spatialleave', transform, frame, ray))
    this.hoveredId = nextId
    if (this.hoveredId && transform) events.push(this.event('spatialenter', transform, frame, ray))
  }

  private event(
    type: 'spatialenter' | 'spatialleave' | 'grabstart' | 'grabmove' | 'grabend' | 'grabcancel',
    transform: SpatialTransform,
    frame: SpatialInteractionInputs['interactionFrame'],
    ray: SpatialRay | null,
  ): SpatialInteractionEvent {
    const base = {
      type,
      targetId: PALM_HOLOGRAM_TARGET_ID,
      position: { ...transform.position },
      timestampMs: frame.timestampMs,
      trackId: this.capture?.trackId ?? frame.primaryTrackId,
      ...(frame.pointer || frame.events.at(-1)
        ? { pointer: { ...(frame.pointer?.position ?? frame.events.at(-1)!.position) } }
        : {}),
      ...(ray ? { ray: structuredClone(ray) } : {}),
    }
    if (type === 'grabcancel') return { ...base, type, reason: frame.terminationReason ?? 'tracking_lost' }
    if (type === 'grabmove') return { ...base, type, depthRatio: 1 }
    return base as SpatialInteractionEvent
  }
}
