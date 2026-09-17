import { useState } from 'react'
import type { FingerName } from '../types/gestures'
import type { SpatialQuaternion } from '../types/spatial'
import type { TrackingDebugSnapshot } from '../types/tracking'
import type { UiSemanticSnapshot } from '../lib/interaction-bridge'

const FINGER_LABELS: Array<[FingerName, string]> = [
  ['thumb', 'T'],
  ['index', 'I'],
  ['middle', 'M'],
  ['ring', 'R'],
  ['pinky', 'P'],
]

const quaternionText = (q: SpatialQuaternion | null | undefined) => q
  ? `${q.x.toFixed(3)} ${q.y.toFixed(3)} ${q.z.toFixed(3)} ${q.w.toFixed(3)}` : '—'

interface DebugPanelProps {
  snapshot: TrackingDebugSnapshot
  semantics: UiSemanticSnapshot
  getDepthTraceJSON: () => string | null
}

export function DebugPanel({ snapshot, semantics, getDepthTraceJSON }: DebugPanelProps) {
  const [copyStatus, setCopyStatus] = useState('')
  const interaction = snapshot.interaction
  const pointer = interaction?.pointer
  const drag = interaction?.drag
  const lastEvent = interaction?.events.at(-1)
  const spatial = snapshot.spatialInteraction
  const spatialDebug = spatial?.debug
  const spatialPosition = spatial?.transform?.position
  const depth = spatialDebug?.depth
  const rotation = spatialDebug?.rotation
  const degrees = (angle: number | null | undefined) => angle == null ? '—' : `${(angle * 180 / Math.PI).toFixed(2)}°`

  const copyDepthTrace = async () => {
    try {
      const trace = getDepthTraceJSON()
      if (!trace) throw new Error('Depth trace is unavailable')
      await navigator.clipboard.writeText(trace)
      setCopyStatus('Depth trace copied')
    } catch {
      setCopyStatus('Could not copy depth trace')
    }
  }

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
          <span>SOURCE</span><span>{semantics.activeSource?.toUpperCase() ?? '—'}</span>
          <span>GESTURE</span><span>{interaction ? `${interaction.rawGesture ?? '—'} / ${interaction.stableGesture ?? '—'}`.toUpperCase() : '—'}</span>
          <span>PINCH</span><span>{interaction?.pinchEvidence
            ? `${interaction.pinchEvidence.phase.toUpperCase()} ${interaction.pinchEvidence.normalizedDistance?.toFixed(3) ?? '—'}`
            : '—'}</span>
          <span>POINTER</span><span>{pointer ? `${pointer.position.x.toFixed(3)} ${pointer.position.y.toFixed(3)}` : '—'}</span>
          <span>ANCHOR</span><span>{pointer ? `${pointer.anchorSource.toUpperCase()} / ${pointer.quality.toUpperCase()}` : '—'}</span>
          <span>VELOCITY</span><span>{pointer ? `${pointer.velocity.x.toFixed(2)} ${pointer.velocity.y.toFixed(2)} | ${pointer.velocity.magnitude.toFixed(2)}` : '—'}</span>
          <span>DRAG</span><span>{drag ? `${drag.totalDelta.x.toFixed(3)} ${drag.totalDelta.y.toFixed(3)} | ${drag.distance.toFixed(3)} | ${Math.round(drag.durationMs)}ms` : '—'}</span>
          <span>EVENT</span><span>{lastEvent?.type.toUpperCase() ?? '—'}</span>
          <span>HOVERED</span><span>{semantics.hoveredId ?? '—'}</span>
          <span>CAPTURED</span><span>{semantics.capturedId ?? '—'}</span>
          <span>DRAG TARGET</span><span>{semantics.dragTargetId ?? '—'}</span>
          <span>END</span><span>{interaction?.terminationReason?.toUpperCase() ?? semantics.terminationReason?.toUpperCase() ?? '—'}</span>
          <span>TRANSITION</span><span>{interaction?.lastTransition?.toUpperCase() ?? semantics.lastTransition?.toUpperCase() ?? '—'}</span>
          <span>SPATIAL TARGET</span><span>{spatialDebug?.targetId ?? '—'}</span>
          <span>MODE</span><span>{spatial?.mode.toUpperCase() ?? 'PALM-ANCHORED'}</span>
          <span>HOVER / GRAB</span><span>{spatial ? `${spatial.hovered} / ${spatial.grabbed}`.toUpperCase() : 'FALSE / FALSE'}</span>
          <span>SPATIAL TRACK</span><span>{spatial?.interactionTrackId !== null && spatial?.interactionTrackId !== undefined ? `H${spatial.interactionTrackId}` : '—'}</span>
          <span>RAY ORIGIN</span><span>{spatialDebug?.ray ? `${spatialDebug.ray.origin.x.toFixed(2)} ${spatialDebug.ray.origin.y.toFixed(2)} ${spatialDebug.ray.origin.z.toFixed(2)}` : '—'}</span>
          <span>RAY DIRECTION</span><span>{spatialDebug?.ray ? `${spatialDebug.ray.direction.x.toFixed(2)} ${spatialDebug.ray.direction.y.toFixed(2)} ${spatialDebug.ray.direction.z.toFixed(2)}` : '—'}</span>
          <span>OBJECT XYZ</span><span>{spatialPosition ? `${spatialPosition.x.toFixed(2)} ${spatialPosition.y.toFixed(2)} ${spatialPosition.z.toFixed(2)}` : '—'}</span>
          <span>GRAB OFFSET</span><span>{spatialDebug?.grabOffset ? `${spatialDebug.grabOffset.x.toFixed(3)} ${spatialDebug.grabOffset.y.toFixed(3)}` : '—'}</span>
          <span>DEPTH / DURATION</span><span>{spatialDebug ? `${spatialDebug.depthRatio.toFixed(2)} / ${Math.round(spatialDebug.grabDurationMs)}ms` : '—'}</span>
          <span>SPATIAL EVENT</span><span>{spatialDebug?.lastEvent?.toUpperCase() ?? '—'}</span>
        </div>
        <div className="debug-depth">
          <div className="debug-section-heading">DEPTH</div>
          <div className="debug-interaction-grid">
            <span>TRACKING</span><span>{depth?.trackingValid ? 'VALID' : 'HELD'}</span>
            <span>TIMESTAMP</span><span>{depth?.timestampMs.toFixed(0) ?? '—'}</span>
            <span>RAW / BASELINE SCALE</span><span>{depth ? `${depth.rawPalmScale.toFixed(3)} / ${depth.baselinePalmScale.toFixed(3)}` : '—'}</span>
            <span>RAW / FILTERED RATIO</span><span>{depth ? `${depth.scaleRatio.toFixed(3)} / ${depth.filteredScaleRatio.toFixed(3)}` : '—'}</span>
            <span>RELATIVE DEPTH</span><span>{depth?.relativeDepth.toFixed(3) ?? '—'}</span>
            <span>WORLD Z</span><span>{spatialPosition?.z.toFixed(3) ?? '—'}</span>
            <span>VELOCITY</span><span>{depth?.velocity.toFixed(3) ?? '—'}</span>
          </div>
          {import.meta.env.DEV ? (
            <div className="debug-depth-actions">
              <button type="button" onClick={() => void copyDepthTrace()}>COPY DEPTH TRACE</button>
              <span className="debug-copy-status" role="status" aria-live="polite">{copyStatus}</span>
            </div>
          ) : null}
        </div>
        <p className="debug-hint">Press R to reset the hologram to palm-anchored mode.</p>
        <div className="debug-depth">
          <div className="debug-section-heading">ROTATION</div>
          <div className="debug-interaction-grid">
            <span>STATE</span><span>{rotation?.state.toUpperCase() ?? 'HELD'}</span>
            <span>HOLD REASON</span><span>{rotation?.holdReason ?? 'NONE'}</span>
            <span>FRAME EVENTS</span><span>{rotation?.inputEvents.join(', ') || 'NONE'}</span>
            <span>INPUT HAND XYZW</span><span>{quaternionText(rotation?.handRotation)}</span>
            <span>BASELINE HAND XYZW</span><span>{quaternionText(rotation?.baselineHandRotation)}</span>
            <span>DELTA XYZW</span><span>{quaternionText(rotation?.deltaRotation)}</span>
            <span>TARGET XYZW</span><span>{quaternionText(rotation?.targetObjectRotation)}</span>
            <span>APPLIED XYZW</span><span>{quaternionText(rotation?.appliedObjectRotation)}</span>
            <span>HAND DELTA</span><span>{degrees(rotation?.deltaAngleFromBaseline)}</span>
            <span>TARGET DELTA</span><span>{degrees(rotation?.targetDeltaAngle)}</span>
            <span>APPLIED DELTA</span><span>{degrees(rotation?.appliedDeltaAngle)}</span>
            <span>REMAINING</span><span>{degrees(rotation?.remainingAngleToTarget)}</span>
            <span>VELOCITY RAD/S</span><span>{rotation?.angularVelocity.toFixed(3) ?? '—'}</span>
            <span>MAX STEP</span><span>{degrees(rotation?.maxAngularStep)}</span>
            <span>DT RAW / EFFECTIVE</span><span>{rotation ? `${rotation.rawDeltaMs.toFixed(1)} / ${rotation.effectiveDeltaMs.toFixed(1)} ms` : '—'}</span>
          </div>
        </div>
        <div className="debug-history" aria-label="Recent interaction transitions">
          {semantics.history.map((entry) => (
            <span key={`${entry.timestampMs}:${entry.transition}:${entry.targetId ?? ''}`}>
              {entry.transition.toUpperCase()} {entry.targetId ?? '—'} {entry.reason?.toUpperCase() ?? ''}
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
