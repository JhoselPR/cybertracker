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
  const interaction = snapshot.interaction
  const pointer = interaction?.pointer
  const drag = interaction?.drag
  const lastEvent = interaction?.events.at(-1)

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

      <div className="debug-interaction">
        <div className="debug-section-heading">INTERACTION</div>
        <div className="debug-interaction-grid">
          <span>PRIMARY</span>
          <span>{interaction?.primaryHand
            ? `H${interaction.primaryHand.trackId} ${interaction.primaryHand.handedness.toUpperCase()}`
            : '—'}</span>
          <span>STATE</span><span>{interaction?.state.toUpperCase() ?? 'IDLE'}</span>
          <span>POINTER</span><span>{pointer ? `${pointer.position.x.toFixed(3)} ${pointer.position.y.toFixed(3)}` : '—'}</span>
          <span>VELOCITY</span><span>{pointer ? `${pointer.velocity.x.toFixed(2)} ${pointer.velocity.y.toFixed(2)} | ${pointer.velocity.magnitude.toFixed(2)}` : '—'}</span>
          <span>DRAG</span><span>{drag ? `${drag.totalDelta.x.toFixed(3)} ${drag.totalDelta.y.toFixed(3)} | ${drag.distance.toFixed(3)} | ${Math.round(drag.durationMs)}ms` : '—'}</span>
          <span>EVENT</span><span>{lastEvent?.type.toUpperCase() ?? '—'}</span>
        </div>
      </div>
    </aside>
  )
}
