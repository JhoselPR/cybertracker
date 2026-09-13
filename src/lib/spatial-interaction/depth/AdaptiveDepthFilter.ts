export class AdaptiveDepthFilter {
  private value = 0
  private initialized = false

  reset(value = 0): void {
    this.value = Number.isFinite(value) ? value : 0
    this.initialized = true
  }

  update(target: number, dtSeconds: number, timeConstantSeconds: number): number {
    if (!this.initialized) this.reset(target)
    const alpha = 1 - Math.exp(-Math.max(0, dtSeconds) / timeConstantSeconds)
    this.value += (target - this.value) * alpha
    return this.value
  }

  current(): number {
    return this.value
  }
}
