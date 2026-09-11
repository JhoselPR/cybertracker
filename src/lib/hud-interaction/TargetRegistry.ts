import { BoundsCache } from './BoundsCache'
import type { RegisteredTarget, TargetDefinition } from './types'

export type RegistryMutation = { type: 'removed'; id: string } | { type: 'bounds-dirty' }

export class TargetRegistry {
  private readonly targets = new Map<string, RegisteredTarget>()
  private order = 0
  readonly bounds: BoundsCache

  constructor(private readonly onMutation: (mutation: RegistryMutation) => void = () => undefined) {
    this.bounds = new BoundsCache(() => this.onMutation({ type: 'bounds-dirty' }))
  }

  register(definition: TargetDefinition): () => void {
    this.remove(definition.id)
    const target = { ...definition, registrationOrder: ++this.order }
    this.targets.set(target.id, target)
    this.bounds.register(target.id, target.getBounds, target.element)
    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.targets.get(target.id) === target) this.remove(target.id)
    }
  }

  get(id: string): RegisteredTarget | null {
    return this.targets.get(id) ?? null
  }

  update(id: string, patch: Partial<Pick<RegisteredTarget, 'zRank' | 'enabled'>>): void {
    const target = this.targets.get(id)
    if (target) Object.assign(target, patch)
  }

  all(): readonly RegisteredTarget[] {
    return [...this.targets.values()]
  }

  invalidate(id?: string): void {
    if (id) this.bounds.invalidate(id)
    else this.bounds.invalidateAll()
  }

  connect(): () => void {
    return this.bounds.connect()
  }

  dispose(): void {
    for (const id of [...this.targets.keys()]) this.remove(id)
    this.bounds.dispose()
  }

  private remove(id: string): void {
    if (!this.targets.delete(id)) return
    this.bounds.unregister(id)
    this.onMutation({ type: 'removed', id })
  }
}
