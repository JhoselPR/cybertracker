import type { FingerName } from '../types/gestures'
import type { TrackingDebugSnapshot } from '../types/tracking'

const FINGER_LABELS: Array<[FingerName, string]> = [
  ['thumb', 'T'],
  ['index', 'I'],
  ['middle', 'M'],
  ['ring', 'R'],
  ['pinky', 'P'],
]

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

      {snapshot.hands.map((hand) => (
        <div className="debug-hand" key={hand.trackId}>
          <div className="debug-hand-heading">
            <span className="debug-hand-name">H{hand.trackId} {hand.handedness.toUpperCase()}</span>
            <span>{Math.round(hand.rawGesture.confidence * 100)}%</span>
          </div>
          <div className="debug-gestures">
            <span>RAW {hand.rawGesture.gesture.toUpperCase()}</span>
            <span>STABLE {hand.stableGesture.gesture.toUpperCase()}</span>
          </div>
          <div className="debug-fingers" aria-label={`Finger states for hand ${hand.trackId}`}>
            {FINGER_LABELS.map(([finger, label]) => (
              <span key={finger} title={finger}>
                {label}:{hand.rawGesture.fingers[finger].slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      ))}
    </aside>
  )
}
