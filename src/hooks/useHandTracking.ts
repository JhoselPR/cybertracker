import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { InteractionRuntime } from '../lib/interaction-bridge'
import { GestureEngine } from '../lib/gestures'
import { InteractionEngine } from '../lib/interaction'
import { clearTrackingCanvas, drawTrackingFrame } from '../lib/rendering/drawHands'
import type { SpatialHandPoseRuntime } from '../lib/spatial'
import { createHandTracker, type HandTracker } from '../lib/vision/handTracker'
import type { TrackerStatus, TrackingDebugSnapshot } from '../types/tracking'
import { getErrorMessage, isCameraPermissionError } from '../utils/errors'

const DEBUG_UPDATE_INTERVAL_MS = 250
const FPS_SAMPLE_INTERVAL_MS = 500

const EMPTY_DEBUG: TrackingDebugSnapshot = { fps: 0, hands: [], interaction: null }

export function useHandTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  runtime: InteractionRuntime,
  spatialRuntime: SpatialHandPoseRuntime,
  debugEnabledRef: RefObject<boolean>,
) {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<TrackerStatus>({
    kind: 'loading',
    message: 'Requesting camera access…',
  })
  const [debug, setDebug] = useState<TrackingDebugSnapshot>(EMPTY_DEBUG)

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    let cancelled = false
    let stream: MediaStream | null = null
    let tracker: HandTracker | null = null
    const gestureEngine = new GestureEngine()
    const interactionEngine = new InteractionEngine()
    let animationFrame = 0
    let stopped = false
    let previousVideoTime = -1
    let lastDebugUpdate = 0
    let fpsWindowStart = performance.now()
    let inferenceCount = 0
    let fps = 0
    let canvasHasDiagnostics = false

    runtime.reset()
    spatialRuntime.reset()
    setStatus({ kind: 'loading', message: 'Requesting camera access…' })
    setDebug(EMPTY_DEBUG)

    const stop = () => {
      if (stopped) return
      stopped = true

      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }

      const activeStream = stream
      const activeTracker = tracker
      stream = null
      tracker = null
      gestureEngine.dispose()
      interactionEngine.dispose()
      runtime.reset()
      spatialRuntime.reset()

      if (video.srcObject === activeStream) video.srcObject = null
      activeStream?.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // Continue releasing the remaining resources after a teardown failure.
        }
      })

      try {
        activeTracker?.close()
      } catch {
        // MediaPipe teardown is best-effort; the remaining cleanup must still run.
      }

      try {
        clearTrackingCanvas(canvas)
      } catch {
        // A lost canvas context must not prevent the lifecycle from stopping.
      }
    }

    const start = async () => {
      try {
        const acquiredStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        if (cancelled) {
          acquiredStream.getTracks().forEach((track) => track.stop())
          return
        }
        stream = acquiredStream

        video.srcObject = stream
        await video.play()
        if (cancelled) return stop()

        setStatus({ kind: 'loading', message: 'Loading hand tracking model…' })
        const createdTracker = await createHandTracker()
        if (cancelled) {
          createdTracker.close()
          return
        }
        tracker = createdTracker

        setStatus({ kind: 'ready' })

        const detect = (now: number) => {
          if (cancelled) return

          try {
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== previousVideoTime) {
              previousVideoTime = video.currentTime
              const frame = tracker!.detect(video, now)
              const enrichedFrame = gestureEngine.processFrame(frame, {
                aspectRatio: video.videoWidth / video.videoHeight,
              })
              spatialRuntime.channel.publish(spatialRuntime.engine.processFrame(enrichedFrame, {
                sourceWidth: video.videoWidth,
                sourceHeight: video.videoHeight,
                viewportWidth: canvas.clientWidth,
                viewportHeight: canvas.clientHeight,
                mirrorX: true,
              }))
              const interactionFrame = interactionEngine.processFrame(enrichedFrame, {
                sourceWidth: video.videoWidth,
                sourceHeight: video.videoHeight,
                viewportWidth: canvas.clientWidth,
                viewportHeight: canvas.clientHeight,
                mirrorX: true,
              })
              runtime.bridge.publishInteractionFrame(interactionFrame)
              if (debugEnabledRef.current) {
                drawTrackingFrame(canvas, video, enrichedFrame, interactionFrame)
                canvasHasDiagnostics = true
              } else if (canvasHasDiagnostics) {
                clearTrackingCanvas(canvas)
                canvasHasDiagnostics = false
                setDebug(EMPTY_DEBUG)
              }
              inferenceCount += 1

              const fpsElapsed = now - fpsWindowStart
              if (fpsElapsed >= FPS_SAMPLE_INTERVAL_MS) {
                fps = (inferenceCount * 1000) / fpsElapsed
                inferenceCount = 0
                fpsWindowStart = now
              }

              if (debugEnabledRef.current && now - lastDebugUpdate >= DEBUG_UPDATE_INTERVAL_MS) {
                // This low-frequency snapshot is diagnostics, not the authoritative event channel.
                setDebug({ fps, hands: enrichedFrame.hands, interaction: interactionFrame })
                lastDebugUpdate = now
              }
            }

            animationFrame = requestAnimationFrame(detect)
          } catch (error) {
            stop()
            if (cancelled) return
            setStatus({
              kind: 'error',
              message: `Hand tracking stopped after a runtime error. Retry to restart the camera and tracker. Details: ${getErrorMessage(error)}`,
            })
          }
        }

        animationFrame = requestAnimationFrame(detect)
      } catch (error) {
        if (cancelled) return
        stop()

        if (isCameraPermissionError(error)) {
          setStatus({
            kind: 'permission-denied',
            message: 'Camera access was denied. Allow camera access in your browser, then retry.',
          })
        } else {
          setStatus({
            kind: 'error',
            message: `Cybertracker could not start: ${getErrorMessage(error)}`,
          })
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      stop()
    }
  }, [attempt, canvasRef, debugEnabledRef, runtime, spatialRuntime, videoRef])

  return { status, debug, retry }
}
