import { useEffect, useRef } from 'react'
import type { InteractionRuntime, UiInputFrame } from '../../lib/interaction-bridge'
import type { HologramStateChannel } from '../../lib/spatial-interaction'
import type { SpatialCursorState } from '../../types/spatialInteraction'
import { paintSpatialCursor } from './paintSpatialCursor'

interface SpatialCursorProps {
  runtime: InteractionRuntime
  spatialChannel: HologramStateChannel
}

export function SpatialCursor({ runtime, spatialChannel }: SpatialCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let pending: UiInputFrame | null = null
    let spatialState: SpatialCursorState = 'normal'
    let raf = 0
    const paint = () => {
      raf = 0
      const cursor = cursorRef.current
      if (!cursor) return
      paintSpatialCursor(cursor, pending, spatialState, { width: window.innerWidth, height: window.innerHeight })
    }
    const schedulePaint = () => {
      if (!raf) raf = requestAnimationFrame(paint)
    }
    const unsubscribe = runtime.bridge.subscribeFrames((frame) => {
      const activeSource = runtime.bridge.getSnapshot().activeSource
      if (activeSource && activeSource !== frame.source) return
      pending = frame
      schedulePaint()
    })
    const unsubscribeSpatial = spatialChannel.subscribe((state) => {
      spatialState = state.cursorState
      schedulePaint()
    })
    return () => {
      unsubscribe()
      unsubscribeSpatial()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [runtime, spatialChannel])

  return (
    <div ref={cursorRef} className="spatial-cursor" data-state="normal" aria-hidden="true">
      <span className="cursor-reticle" />
      <span className="cursor-dot" />
      <span className="cursor-tick cursor-tick-x" />
      <span className="cursor-tick cursor-tick-y" />
    </div>
  )
}
