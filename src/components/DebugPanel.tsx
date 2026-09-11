import type { TrackingDebugSnapshot } from '../types/tracking'

function coordinate(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(3)
}

interface DebugPanelProps {
  snapshot: TrackingDebugSnapshot
}

export function DebugPanel({ snapshot }: DebugPanelProps) {
  return (
    <aside className="debug-panel" aria-label="Hand tracking diagnostics">
      <div className="debug-summary">
        <span>{snapshot.fps.toFixed(1)} FPS</span>
        <span>{snapshot.hands.length} HAND{snapshot.hands.length === 1 ? '' : 'S'}</span>
      </div>

      {snapshot.hands.map((hand, index) => {
        const tip = hand.landmarks[8]
        return (
          <div className="debug-hand" key={`${index}-${hand.handedness}`}>
            <span className="debug-hand-name">
              H{index + 1} {hand.handedness.toUpperCase()} {Math.round(hand.confidence * 100)}%
            </span>
            <span>X {coordinate(tip?.x)}</span>
            <span>Y {coordinate(tip?.y)}</span>
            <span>Z {coordinate(tip?.z)}</span>
          </div>
        )
      })}
    </aside>
  )
}
