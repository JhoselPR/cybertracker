import { useEffect, useRef } from 'react'
import type { InteractionRuntime, UiInputFrame } from '../../lib/interaction-bridge'

interface SpatialCursorProps {
  runtime: InteractionRuntime
}

export function SpatialCursor({ runtime }: SpatialCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let pending: UiInputFrame | null = null
    let raf = 0
    const paint = () => {
      raf = 0
      const cursor = cursorRef.current
      const pointer = pending?.pointer
      if (!cursor) return
      if (!pointer?.visible) {
        cursor.dataset.state = 'idle'
        cursor.style.visibility = 'hidden'
        return
      }
      cursor.style.visibility = 'visible'
      cursor.style.transform = `translate3d(${pointer.position.x * window.innerWidth}px, ${pointer.position.y * window.innerHeight}px, 0)`
      cursor.dataset.state = pointer.state
      cursor.dataset.quality = pointer.quality
    }
    const unsubscribe = runtime.bridge.subscribeFrames((frame) => {
      const activeSource = runtime.bridge.getSnapshot().activeSource
      if (activeSource && activeSource !== frame.source) return
      pending = frame
      if (!raf) raf = requestAnimationFrame(paint)
    })
    return () => {
      unsubscribe()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [runtime])

  return (
    <div ref={cursorRef} className="spatial-cursor" data-state="idle" aria-hidden="true">
      <span className="cursor-reticle" />
      <span className="cursor-dot" />
      <span className="cursor-tick cursor-tick-x" />
      <span className="cursor-tick cursor-tick-y" />
    </div>
  )
}
