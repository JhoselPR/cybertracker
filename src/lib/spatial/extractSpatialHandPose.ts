import type { EnrichedHand } from '../../types/gestures'
import type { SpatialBasis, SpatialHandPose, SpatialVector2, SpatialVector3 } from '../../types/spatial'
import type { DepthDistances, DepthEvidence } from '../spatial-interaction/depth'
import type { NormalizedLandmark } from '../../types/tracking'
import { projectSourceToViewport, viewportNormalizedToNdc } from '../coordinates'
import { SPATIAL_POSE_POLICY } from './config'
import { cross3, dot3, negateQuaternion, normalize3, quaternionDot, quaternionFromBasis, scale3, subtract3 } from './math'

export interface SpatialProjectionContext {
  sourceWidth: number
  sourceHeight: number
  viewportWidth: number
  viewportHeight: number
  mirrorX: boolean
}

const PALM = Object.freeze({ wrist: 0, index: 5, middle: 9, ring: 13, pinky: 17 })

function finiteProjectedLandmark(value: NormalizedLandmark | undefined): value is NormalizedLandmark {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y))
}

function finiteLandmark(value: NormalizedLandmark | undefined): value is NormalizedLandmark {
  return Boolean(value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z))
}

function finiteAverage(values: readonly NormalizedLandmark[]): NormalizedLandmark | null {
  const finite = values.filter(finiteLandmark)
  if (finite.length !== values.length || finite.length === 0) return null
  return {
    x: finite.reduce((sum, value) => sum + value.x, 0) / finite.length,
    y: finite.reduce((sum, value) => sum + value.y, 0) / finite.length,
    z: finite.reduce((sum, value) => sum + value.z, 0) / finite.length,
  }
}

function projected(point: NormalizedLandmark, context: SpatialProjectionContext): SpatialVector2 {
  return projectSourceToViewport(
    point,
    context.sourceWidth,
    context.sourceHeight,
    context.viewportWidth,
    context.viewportHeight,
    context.mirrorX,
  )
}

function displayPoint(point: NormalizedLandmark, centerZ: number, context: SpatialProjectionContext): SpatialVector3 {
  const position = projected(point, context)
  const shortest = Math.min(context.viewportWidth, context.viewportHeight)
  return {
    x: position.x * context.viewportWidth / shortest,
    y: -position.y * context.viewportHeight / shortest,
    // MediaPipe Z is relative evidence only; it is never interpreted as metric camera depth.
    z: -(point.z - centerZ) * context.sourceWidth / shortest,
  }
}

function distanceOnViewport(a: SpatialVector2, b: SpatialVector2, context: SpatialProjectionContext): number {
  const shortest = Math.min(context.viewportWidth, context.viewportHeight)
  return Math.hypot(
    (b.x - a.x) * context.viewportWidth / shortest,
    (b.y - a.y) * context.viewportHeight / shortest,
  )
}

export function extractDepthEvidence(
  hand: EnrichedHand,
  timestampMs: number,
  context: SpatialProjectionContext,
): DepthEvidence | null {
  if (!Number.isFinite(hand.trackId) || hand.trackId < 0 || !Number.isFinite(timestampMs)) return null
  const wrist = hand.landmarks[PALM.wrist]
  const index = hand.landmarks[PALM.index]
  const middle = hand.landmarks[PALM.middle]
  const ring = hand.landmarks[PALM.ring]
  const pinky = hand.landmarks[PALM.pinky]
  const landmarks = [wrist, index, middle, ring, pinky] as const
  try {
    const projectedPoints = landmarks.map((landmark) => landmark && finiteProjectedLandmark(landmark) ? projected(landmark, context) : null)
    const pairs = [[0, 2], [1, 4]] as const
    const distanceIndices = [1, 7] as const
    const distances = new Array<number>(8).fill(0)
    let validMask = 0
    for (let i = 0; i < pairs.length; i += 1) {
      const [a, b] = pairs[i]
      const first = projectedPoints[a]
      const second = projectedPoints[b]
      if (!first || !second) continue
      const distance = distanceOnViewport(first, second, context)
      if (!Number.isFinite(distance) || distance < 1e-5) continue
      const distanceIndex = distanceIndices[i]
      distances[distanceIndex] = distance
      validMask |= 1 << distanceIndex
    }
    const zScratch = new Array<number>(5)
    let zCount = 0
    let visibilitySum = 0
    let visibilityCount = 0
    let hasPositiveVisibility = false
    const shortest = Math.min(context.viewportWidth, context.viewportHeight)
    for (let i = 0; i < 5; i += 1) {
      const landmark = landmarks[i]
      if (!landmark || !finiteLandmark(landmark)) continue
      zScratch[zCount++] = landmark.z * context.sourceWidth / shortest
      if (Number.isFinite(landmark.visibility)) {
        visibilitySum += Math.max(0, Math.min(1, landmark.visibility!))
        visibilityCount += 1
        hasPositiveVisibility ||= landmark.visibility! > 0
      }
    }
    zScratch.length = zCount
    zScratch.sort((a, b) => a - b)
    const palmZ = zCount >= 3 ? zScratch[zCount >> 1] : null
    return {
      trackId: hand.trackId,
      timestampMs,
      projectionId: (((context.sourceWidth * 31 + context.sourceHeight) * 31 + context.viewportWidth) * 31
        + context.viewportHeight) * 2 + Number(context.mirrorX),
      distances: distances as unknown as DepthDistances,
      validMask,
      palmZ,
      visibility: visibilityCount && hasPositiveVisibility ? visibilitySum / visibilityCount : null,
    }
  } catch {
    return null
  }
}

function fallbackOrientation(
  pose: Omit<SpatialHandPose, 'basis' | 'normal' | 'quaternion'>,
  previous: SpatialHandPose | null,
): SpatialHandPose | null {
  if (!previous || previous.trackId !== pose.trackId
    || pose.timestampMs - previous.timestampMs > SPATIAL_POSE_POLICY.orientationFallbackMs) return null
  return { ...pose, basis: previous.basis, normal: previous.normal, quaternion: previous.quaternion }
}

/**
 * Maps normalized source landmarks through the shared cover/mirror projection, then into NDC/Three space.
 * The hologram is an overlay: camera-depth occlusion is intentionally unavailable without segmentation.
 */
export function extractSpatialHandPose(
  hand: EnrichedHand,
  timestampMs: number,
  context: SpatialProjectionContext,
  previous: SpatialHandPose | null = null,
  interaction = false,
): SpatialHandPose | null {
  if (!Number.isFinite(timestampMs) || !Number.isFinite(hand.trackId) || hand.trackId < 0) return null
  const points = PALM
  const wrist = hand.landmarks[points.wrist]
  const index = hand.landmarks[points.index]
  const middle = hand.landmarks[points.middle]
  const ring = hand.landmarks[points.ring]
  const pinky = hand.landmarks[points.pinky]
  if (![wrist, index, middle, ring, pinky].every(finiteLandmark)) return null

  try {
    const sourceCenter = finiteAverage([wrist, index, middle, ring, pinky])
    if (!sourceCenter) return null
    const center = projected(sourceCenter, context)
    const anchor2 = viewportNormalizedToNdc(center)
    const width = distanceOnViewport(projected(index, context), projected(pinky, context), context)
    const length = distanceOnViewport(projected(wrist, context), projected(middle, context), context)
    if (!Number.isFinite(width) || !Number.isFinite(length)
      || (!interaction && (width < 1e-5 || length < 1e-5))) return null
    const scale = Math.max(
      SPATIAL_POSE_POLICY.minimumScale,
      Math.min(SPATIAL_POSE_POLICY.maximumScale, Math.sqrt(width * length)),
    )
    const partial = {
      timestampMs,
      trackId: hand.trackId,
      handedness: hand.handedness,
      confidence: hand.stableGesture.confidence,
      center,
      anchor: { ...anchor2, z: 0 },
      scale,
    }

    const displayWrist = displayPoint(wrist, sourceCenter.z, context)
    const displayIndex = displayPoint(index, sourceCenter.z, context)
    const displayMiddle = displayPoint(middle, sourceCenter.z, context)
    const displayPinky = displayPoint(pinky, sourceCenter.z, context)
    const x = normalize3(subtract3(displayPinky, displayIndex))
    const wristToFingers = subtract3(displayMiddle, displayWrist)
    if (!x) return interaction ? null : fallbackOrientation(partial, previous)
    const y = normalize3(subtract3(wristToFingers, scale3(x, dot3(wristToFingers, x))))
    if (!y) return interaction ? null : fallbackOrientation(partial, previous)
    const z = normalize3(cross3(x, y))
    if (!z) return interaction ? null : fallbackOrientation(partial, previous)
    const basis: SpatialBasis = { x, y, z }
    let quaternion = quaternionFromBasis(basis)

    if (previous?.trackId === hand.trackId) {
      if (!interaction && dot3(z, previous.normal) < 0) return fallbackOrientation(partial, previous)
      if (quaternionDot(quaternion, previous.quaternion) < 0) quaternion = negateQuaternion(quaternion)
    }
    return { ...partial, basis, normal: z, quaternion }
  } catch {
    return null
  }
}
