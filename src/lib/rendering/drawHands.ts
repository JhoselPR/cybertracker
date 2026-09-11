import type { EnrichedTrackingFrame } from '../../types/gestures'
import type { InteractionFrame } from '../../types/interaction'
import { projectSourceToViewport } from '../coordinates'
import { HAND_CONNECTIONS } from '../vision/handTopology'

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
  frame: EnrichedTrackingFrame,
  interaction: InteractionFrame,
): void {
  const context = syncCanvasSize(canvas)
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  if (!context) return
  context.clearRect(0, 0, width, height)
  if (!video.videoWidth || !video.videoHeight) return

  const toPoint = (x: number, y: number) => {
    const projected = projectSourceToViewport(
      { x, y }, video.videoWidth, video.videoHeight, width, height, true,
    )
    return { x: projected.x * width, y: projected.y * height }
  }

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

    if (hand.stableGesture.gesture !== 'unknown') {
      const labelPoint = toPoint(hand.stableGesture.position.x, hand.stableGesture.position.y)
      const label = hand.stableGesture.gesture.replace('_', ' ').toUpperCase()
      context.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.textBaseline = 'bottom'
      const labelWidth = context.measureText(label).width
      const x = Math.max(6, Math.min(width - labelWidth - 14, labelPoint.x + 10))
      const y = Math.max(20, Math.min(height - 6, labelPoint.y - 10))
      context.fillStyle = 'rgba(0, 8, 10, 0.78)'
      context.fillRect(x - 5, y - 14, labelWidth + 10, 18)
      context.fillStyle = '#d8fdff'
      context.fillText(label, x, y)
    }
  }

  if (interaction.pointer) {
    const { x, y } = interaction.pointer.position
    const pointerX = x * width
    const pointerY = y * height
    const color = interaction.pointer.stale
      ? 'rgba(216, 253, 255, 0.45)'
      : interaction.state === 'dragging'
        ? '#ffcf5a'
        : interaction.state === 'pinching'
          ? '#ff7ad9'
          : '#4bf7ff'
    context.beginPath()
    context.arc(pointerX, pointerY, interaction.state === 'dragging' ? 7 : 5, 0, Math.PI * 2)
    context.strokeStyle = color
    context.lineWidth = 2
    context.stroke()

    const stateLabel = interaction.pointer.stale ? 'STALE' : interaction.state.toUpperCase()
    context.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace'
    context.textBaseline = 'top'
    context.fillStyle = color
    context.fillText(stateLabel, Math.min(width - 58, pointerX + 10), Math.min(height - 16, pointerY + 8))
  }
}

export function clearTrackingCanvas(canvas: HTMLCanvasElement): void {
  const context = syncCanvasSize(canvas)
  context?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
}
