import { useEffect, useRef, useState } from 'react'
import type { HologramStateChannel } from '../lib/spatial-interaction'
import {
  connectPalmHologram,
  type PalmHologramConnection,
  type PalmHologramStatus,
} from '../lib/rendering/connectPalmHologram'

interface PalmHologramProps {
  channel: HologramStateChannel
  debug: boolean
  enabled: boolean
}

export function PalmHologram({ channel, debug, enabled }: PalmHologramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const connectionRef = useRef<PalmHologramConnection | null>(null)
  const [rendererStatus, setRendererStatus] = useState<PalmHologramStatus>('initializing')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return
    const connection = connectPalmHologram(canvas, channel, false, undefined, setRendererStatus)
    connectionRef.current = connection
    return () => {
      connection.dispose()
      if (connectionRef.current === connection) connectionRef.current = null
    }
  }, [channel, enabled])

  useEffect(() => {
    connectionRef.current?.setDebug(debug)
  }, [debug])

  const status = enabled ? rendererStatus : 'initializing'
  return <canvas ref={canvasRef} className="hologram-layer" data-status={status} aria-hidden="true" />
}
