import type { PalmHologramStatus } from './connectPalmHologram'

export interface AnimationScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

const browserScheduler: AnimationScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

export class HologramFrameLoop {
  private frame: number | null = null
  private status: PalmHologramStatus = 'initializing'
  private disposed = false

  constructor(
    private readonly render: FrameRequestCallback,
    private readonly restore: () => void,
    private readonly onStatus: (status: PalmHologramStatus) => void,
    private readonly scheduler: AnimationScheduler = browserScheduler,
  ) {}

  start(): void {
    if (this.disposed) return
    this.status = 'ready'
    this.onStatus('ready')
    this.schedule()
  }

  contextLost(): void {
    if (this.disposed) return
    this.stop()
    this.status = 'context-lost'
    this.onStatus('context-lost')
  }

  contextRestored(): void {
    if (this.disposed) return
    try {
      this.restore()
      this.start()
    } catch {
      this.stop()
      this.status = 'failed'
      this.onStatus('failed')
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stop()
  }

  private readonly tick: FrameRequestCallback = (nowMs) => {
    this.frame = null
    if (this.disposed || this.status !== 'ready') return
    this.render(nowMs)
    this.schedule()
  }

  private schedule(): void {
    if (this.frame === null && !this.disposed && this.status === 'ready') {
      this.frame = this.scheduler.request(this.tick)
    }
  }

  private stop(): void {
    if (this.frame === null) return
    this.scheduler.cancel(this.frame)
    this.frame = null
  }
}
