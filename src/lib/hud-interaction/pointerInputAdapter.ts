import type { UiInputEvent, UiInputFrame, UiPoint } from '../interaction-bridge/types'
import { INTERACTION_DEFAULTS } from '../interaction/config'
import type { InteractionRuntime } from '../interaction-bridge/interactionRuntime'

function normalizedPoint(event: PointerEvent, element: HTMLElement): UiPoint {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
  }
}

export function attachPointerInput(element: HTMLElement, runtime: InteractionRuntime): () => void {
  let activePointerId: number | null = null
  let downPoint: UiPoint | null = null
  let dragging = false

  const publish = (event: PointerEvent, events: UiInputEvent[], state: 'pointing' | 'pinching' | 'dragging'): void => {
    const position = normalizedPoint(event, element)
    const frame: UiInputFrame = {
      source: 'pointer',
      timestampMs: event.timeStamp,
      pointer: { position, state, visible: true },
      events,
    }
    runtime.bridge.publishInputFrame(frame)
  }

  const move = (event: PointerEvent): void => {
    const position = normalizedPoint(event, element)
    if (activePointerId !== null && event.pointerId !== activePointerId) return
    const events: UiInputEvent[] = [{ type: 'move', position, timestampMs: event.timeStamp }]
    if (activePointerId !== null && downPoint) {
      const distance = Math.hypot(position.x - downPoint.x, position.y - downPoint.y)
      if (!dragging && distance >= INTERACTION_DEFAULTS.dragThreshold) {
        dragging = true
        events.push({ type: 'dragstart', position, timestampMs: event.timeStamp })
      } else if (dragging) {
        events.push({ type: 'dragmove', position, timestampMs: event.timeStamp })
      } else {
        events.push({ type: 'pressmove', position, timestampMs: event.timeStamp })
      }
    }
    publish(event, events, dragging ? 'dragging' : activePointerId === null ? 'pointing' : 'pinching')
  }

  const down = (event: PointerEvent): void => {
    const snapshot = runtime.bridge.getSnapshot()
    if (activePointerId !== null || ((snapshot.pressedId || snapshot.capturedId) && snapshot.activeSource === 'hand')) return
    activePointerId = event.pointerId
    downPoint = normalizedPoint(event, element)
    dragging = false
    element.setPointerCapture?.(event.pointerId)
    publish(event, [{ type: 'pressstart', position: downPoint, timestampMs: event.timeStamp }], 'pinching')
  }

  const finish = (event: PointerEvent, cancelled: boolean): void => {
    if (event.pointerId !== activePointerId) return
    const position = normalizedPoint(event, element)
    const reason = cancelled ? 'source_cancelled' as const : 'released' as const
    const events: UiInputEvent[] = []
    if (dragging) events.push({ type: 'dragend', position, timestampMs: event.timeStamp, reason })
    events.push(cancelled
      ? { type: 'cancel', position, timestampMs: event.timeStamp, reason }
      : { type: 'pressend', position, timestampMs: event.timeStamp, reason })
    publish(event, events, 'pointing')
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId)
    activePointerId = null
    downPoint = null
    dragging = false
  }

  const up = (event: PointerEvent) => finish(event, false)
  const cancel = (event: PointerEvent) => finish(event, true)
  element.addEventListener('pointermove', move)
  element.addEventListener('pointerdown', down)
  element.addEventListener('pointerup', up)
  element.addEventListener('pointercancel', cancel)

  return () => {
    element.removeEventListener('pointermove', move)
    element.removeEventListener('pointerdown', down)
    element.removeEventListener('pointerup', up)
    element.removeEventListener('pointercancel', cancel)
    if (activePointerId !== null) runtime.kernel.reset('source_replaced')
  }
}
