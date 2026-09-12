import { describe, expect, it } from 'vitest'
import type { UiInputFrame } from '../../../lib/interaction-bridge'
import { paintSpatialCursor } from '../paintSpatialCursor'

describe('paintSpatialCursor', () => {
  it('uses the imperative semantic dataset path without React state', () => {
    const cursor = { dataset: {}, style: {} } as HTMLDivElement
    const frame: UiInputFrame = {
      source: 'hand',
      timestampMs: 1,
      pointer: {
        position: { x: 0.25, y: 0.75 },
        state: 'pinching',
        visible: true,
        anchorSource: 'pinch',
        quality: 'tracked',
      },
      events: [],
    }
    paintSpatialCursor(cursor, frame, 'spatial-grabbed', { width: 1000, height: 500 })
    expect(cursor.dataset.state).toBe('spatial-grabbed')
    expect(cursor.style.transform).toBe('translate3d(250px, 375px, 0)')
    expect(cursor.style.visibility).toBe('visible')
  })
})
