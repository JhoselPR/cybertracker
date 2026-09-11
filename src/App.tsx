import { useRef } from 'react'
import { DebugPanel } from './components/DebugPanel'
import { StatusOverlay } from './components/StatusOverlay'
import { useHandTracking } from './hooks/useHandTracking'

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { status, debug, retry } = useHandTracking(videoRef, canvasRef)

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
      <canvas ref={canvasRef} className="tracking-layer" aria-hidden="true" />

      {status.kind === 'ready' ? (
        <DebugPanel snapshot={debug} />
      ) : (
        <StatusOverlay status={status} onRetry={retry} />
      )}
    </main>
  )
}
