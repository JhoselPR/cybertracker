import type { UiPoint } from '../interaction-bridge/types'
import type { RegisteredTarget } from './types'
import type { TargetRegistry } from './TargetRegistry'

export function containsPoint(bounds: { left: number; top: number; right: number; bottom: number }, point: UiPoint): boolean {
  return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom
}

export function hitTest(registry: TargetRegistry, point: UiPoint): RegisteredTarget | null {
  return registry.all()
    .filter((target) => {
      const bounds = registry.bounds.get(target.id)
      return bounds ? containsPoint(bounds, point) : false
    })
    .sort((a, b) => b.zRank - a.zRank || b.registrationOrder - a.registrationOrder)[0] ?? null
}
