import type { SpatialRay } from '../../types/spatialInteraction'
import type { SpatialVector3 } from '../../types/spatial'
import { intersectRaySphere, type RaySphereHit } from './rayMath'

export interface SpatialTargetDefinition {
  id: string
  enabled: boolean
  center: SpatialVector3
  enterRadius: number
  exitRadius: number
}

export interface SpatialTargetHit extends RaySphereHit {
  target: Readonly<SpatialTargetDefinition>
}

function validate(target: SpatialTargetDefinition): void {
  if (!target.id) throw new Error('target id is required')
  if (!Number.isFinite(target.enterRadius) || target.enterRadius <= 0) throw new RangeError('enterRadius must be positive')
  if (!Number.isFinite(target.exitRadius) || target.exitRadius <= target.enterRadius) {
    throw new RangeError('exitRadius must be greater than enterRadius')
  }
  if (![target.center.x, target.center.y, target.center.z].every(Number.isFinite)) throw new RangeError('center must be finite')
}

export class SpatialTargetRegistry {
  private readonly targets = new Map<string, SpatialTargetDefinition>()

  register(definition: SpatialTargetDefinition): () => void {
    validate(definition)
    const target = { ...definition, center: { ...definition.center } }
    this.targets.set(target.id, target)
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.targets.get(target.id) === target) this.targets.delete(target.id)
    }
  }

  update(id: string, patch: Partial<Omit<SpatialTargetDefinition, 'id'>>): void {
    const target = this.targets.get(id)
    if (!target) return
    const next = { ...target, ...patch, center: patch.center ? { ...patch.center } : target.center }
    validate(next)
    Object.assign(target, next)
  }

  nearestPositiveHit(ray: SpatialRay, radius: 'enter' | 'exit' = 'enter'): SpatialTargetHit | null {
    let nearest: SpatialTargetHit | null = null
    for (const target of this.targets.values()) {
      if (!target.enabled) continue
      const hit = intersectRaySphere(ray, target.center, radius === 'enter' ? target.enterRadius : target.exitRadius)
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { ...hit, target }
    }
    return nearest
  }

  hit(id: string, ray: SpatialRay, radius: 'enter' | 'exit'): SpatialTargetHit | null {
    const target = this.targets.get(id)
    if (!target?.enabled) return null
    const hit = intersectRaySphere(ray, target.center, radius === 'enter' ? target.enterRadius : target.exitRadius)
    return hit ? { ...hit, target } : null
  }

  dispose(): void {
    this.targets.clear()
  }
}
