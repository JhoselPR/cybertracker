import { useEffect, useRef, useState } from 'react'
import { DebugPanel } from './components/DebugPanel'
import { PalmHologram } from './components/PalmHologram'
import { StatusOverlay } from './components/StatusOverlay'
import { CyberHud } from './components/hud/CyberHud'
import { useHandTracking } from './hooks/useHandTracking'
import { useInteractionStore } from './hooks/useInteractionStore'
import { createInteractionRuntime } from './lib/interaction-bridge'
import { createSpatialInteractionRuntime } from './lib/spatial-interaction'

function disposeAfterStrictModeProbe(
  lifecycleEpochRef: { current: number },
  epoch: number,
  dispose: () => void,
): void {
  queueMicrotask(() => {
    if (lifecycleEpochRef.current === epoch) dispose()
  })
}

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [runtime] = useState(createInteractionRuntime)
  const [spatialRuntime] = useState(createSpatialInteractionRuntime)
  const snapshot = useInteractionStore(runtime)
  const debugEnabledRef = useRef(snapshot.debug)
  useEffect(() => {
    debugEnabledRef.current = snapshot.debug
  }, [snapshot.debug])
  useEffect(() => {
    if (!import.meta.env.DEV || !snapshot.debug) return
    const resetHologram = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key.toLowerCase() !== 'r' || (target instanceof HTMLElement
        && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) return
      spatialRuntime.reset(event.timeStamp)
    }
    window.addEventListener('keydown', resetHologram)
    return () => window.removeEventListener('keydown', resetHologram)
  }, [snapshot.debug, spatialRuntime])
  const lifecycleEpochRef = useRef(0)
  useEffect(() => {
    const epoch = ++lifecycleEpochRef.current
    return () => disposeAfterStrictModeProbe(lifecycleEpochRef, epoch, () => {
      // React development StrictMode remounts effects; only dispose a runtime that stayed unmounted.
      spatialRuntime.dispose()
      runtime.dispose()
    })
  }, [runtime, spatialRuntime])
  const { status, debug, retry } = useHandTracking(
    videoRef,
    canvasRef,
    runtime,
    spatialRuntime,
    debugEnabledRef,
  )

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
      <PalmHologram channel={spatialRuntime.channel} debug={snapshot.debug} enabled={status.kind === 'ready'} />
      <CyberHud runtime={runtime} spatialChannel={spatialRuntime.channel} />

      {status.kind === 'ready' && snapshot.debug ? (
        <DebugPanel snapshot={debug} semantics={snapshot} />
      ) : status.kind !== 'ready' ? (
        <StatusOverlay status={status} onRetry={retry} />
      ) : null}
    </main>
  )
}
