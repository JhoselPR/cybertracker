import type { TrackingFrame } from '../../types/tracking'
import { HAND_CONNECTIONS } from '../vision/handTopology'

interface CoverTransform {
  scale: number
  offsetX: number
  offsetY: number
}

function getCoverTransform(
  sourceWidth: number,
  sourceHeight: number,
  displayWidth: number,
  displayHeight: number,
): CoverTransform {
  const scale = Math.max(displayWidth / sourceWidth, displayHeight / sourceHeight)

  return {
    scale,
    offsetX: (displayWidth - sourceWidth * scale) / 2,
    offsetY: (displayHeight - sourceHeight * scale) / 2,
  }
}

export function syncCanvasSize(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }

  const context = canvas.getContext('2d')
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)
  return context
}

export function drawTrackingFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  frame: TrackingFrame,
): void {
  const context = syncCanvasSize(canvas)
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  if (!context) return
  context.clearRect(0, 0, width, height)
  if (!video.videoWidth || !video.videoHeight) return

  const transform = getCoverTransform(video.videoWidth, video.videoHeight, width, height)
  const toPoint = (x: number, y: number) => ({
    // The video is mirrored with CSS. Mirror raw MediaPipe X once, here at render time.
    x: (1 - x) * video.videoWidth * transform.scale + transform.offsetX,
    y: y * video.videoHeight * transform.scale + transform.offsetY,
  })

  context.lineCap = 'round'
  context.lineJoin = 'round'

  for (const hand of frame.hands) {
    context.beginPath()
    for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
      const start = hand.landmarks[startIndex]
      const end = hand.landmarks[endIndex]
      if (!start || !end) continue
      const startPoint = toPoint(start.x, start.y)
      const endPoint = toPoint(end.x, end.y)
      context.moveTo(startPoint.x, startPoint.y)
      context.lineTo(endPoint.x, endPoint.y)
    }
    context.strokeStyle = 'rgba(75, 247, 255, 0.72)'
    context.lineWidth = 1.25
    context.stroke()

    for (const landmark of hand.landmarks) {
      const point = toPoint(landmark.x, landmark.y)
      context.beginPath()
      context.arc(point.x, point.y, 2.25, 0, Math.PI * 2)
      context.fillStyle = '#d8fdff'
      context.fill()
      context.strokeStyle = '#00dce8'
      context.lineWidth = 0.75
      context.stroke()
    }
  }
}

export function clearTrackingCanvas(canvas: HTMLCanvasElement): void {
  const context = syncCanvasSize(canvas)
  context?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
}
