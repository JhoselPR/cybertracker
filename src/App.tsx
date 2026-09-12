import { useEffect, useRef, useState } from 'react'
import { DebugPanel } from './components/DebugPanel'
import { StatusOverlay } from './components/StatusOverlay'
import { CyberHud } from './components/hud/CyberHud'
import { useHandTracking } from './hooks/useHandTracking'
import { useInteractionStore } from './hooks/useInteractionStore'
import { createInteractionRuntime } from './lib/interaction-bridge'

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [runtime] = useState(createInteractionRuntime)
  const snapshot = useInteractionStore(runtime)
  const debugEnabledRef = useRef(snapshot.debug)
  useEffect(() => {
    debugEnabledRef.current = snapshot.debug
  }, [snapshot.debug])
  const { status, debug, retry } = useHandTracking(videoRef, canvasRef, runtime, debugEnabledRef)

  return (
    <main className="tracker-shell">
      <video
        ref={videoRef}
        className="camera-feed"
        autoPlay
        muted
        playsInline
        aria-label="Front-facing camera feed"
      />
      <canvas ref={canvasRef} className="tracking-layer" data-visible={snapshot.debug || undefined} aria-hidden="true" />
      <CyberHud runtime={runtime} />

      {status.kind === 'ready' && snapshot.debug ? (
        <DebugPanel snapshot={debug} semantics={snapshot} />
      ) : status.kind !== 'ready' ? (
        <StatusOverlay status={status} onRetry={retry} />
      ) : null}
    </main>
  )
}
