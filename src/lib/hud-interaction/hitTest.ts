import type { UiPoint } from '../interaction-bridge/types'
import type { RegisteredTarget } from './types'
import type { TargetRegistry } from './TargetRegistry'
import { HAND_INTERACTION_POLICY } from '../interactionPolicy'

export function containsPoint(bounds: { left: number; top: number; right: number; bottom: number }, point: UiPoint): boolean {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom
}

interface HitTestOptions {
  spatial?: boolean
  additionalPadding?: number
}

export const spatialPaddingFor = (target: RegisteredTarget): number => {
  if (target.kind === 'panel-header') return HAND_INTERACTION_POLICY.headerHitPadding
  if (target.kind === 'control') return HAND_INTERACTION_POLICY.controlHitPadding
  return HAND_INTERACTION_POLICY.spatialHitPadding
}

const distanceToBounds = (bounds: { left: number; top: number; right: number; bottom: number }, point: UiPoint): number => {
  const dx = Math.max(bounds.left - point.x, 0, point.x - bounds.right)
  const dy = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom)
  return Math.hypot(dx, dy)
}

const semanticRank = (target: RegisteredTarget): number => target.kind === 'control' ? 2 : target.kind === 'button' ? 1 : 0

export function hitTest(registry: TargetRegistry, point: UiPoint, options: HitTestOptions = {}): RegisteredTarget | null {
  return registry.all()
    .map((target) => {
      const bounds = registry.bounds.get(target.id)
      if (!bounds) return null
      const exact = containsPoint(bounds, point)
      const padding = options.spatial ? spatialPaddingFor(target) + (options.additionalPadding ?? 0) : 0
      const distance = distanceToBounds(bounds, point)
      if (!exact && (!target.enabled || distance > padding)) return null
      return { target, exact, distance }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((a, b) => Number(b.exact) - Number(a.exact)
      || a.distance - b.distance
      || b.target.zRank - a.target.zRank
      || semanticRank(b.target) - semanticRank(a.target)
      || a.target.id.localeCompare(b.target.id))[0]?.target ?? null
}
