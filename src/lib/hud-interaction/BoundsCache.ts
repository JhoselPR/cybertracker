import type { Bounds } from './types'

interface BoundsEntry {
  provider: () => Bounds
  value: Bounds | null
  dirty: boolean
  element: Element | null
}

export class BoundsCache {
  private readonly entries = new Map<string, BoundsEntry>()
  private readonly observer: ResizeObserver | null
  private readonly onViewportChange: () => void
  private connected = false

  constructor(onViewportChange: () => void = () => undefined) {
    this.onViewportChange = onViewportChange
    this.observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          this.invalidateAll()
          this.onViewportChange()
        })

  }

  connect(): () => void {
    if (!this.connected && typeof window !== 'undefined') {
      this.connected = true
      window.addEventListener('resize', this.handleViewportChange)
      window.addEventListener('scroll', this.handleViewportChange, true)
    }
    return () => this.disconnect()
  }

  disconnect(): void {
    if (!this.connected || typeof window === 'undefined') return
    this.connected = false
    window.removeEventListener('resize', this.handleViewportChange)
    window.removeEventListener('scroll', this.handleViewportChange, true)
  }

  register(id: string, provider: () => Bounds, element: Element | null = null): void {
    this.unregister(id)
    this.entries.set(id, { provider, value: null, dirty: true, element })
    if (element) this.observer?.observe(element)
  }

  unregister(id: string): void {
    const entry = this.entries.get(id)
    if (entry?.element) this.observer?.unobserve(entry.element)
    this.entries.delete(id)
  }

  get(id: string): Bounds | null {
    const entry = this.entries.get(id)
    if (!entry) return null
    if (entry.dirty || !entry.value) {
      entry.value = entry.provider()
      entry.dirty = false
    }
    return entry.value
  }

  invalidate(id: string): void {
    const entry = this.entries.get(id)
    if (entry) entry.dirty = true
  }

  invalidateAll(): void {
    for (const entry of this.entries.values()) entry.dirty = true
  }

  dispose(): void {
    this.observer?.disconnect()
    this.disconnect()
    this.entries.clear()
  }

  private readonly handleViewportChange = (): void => {
    this.invalidateAll()
    this.onViewportChange()
  }
}
