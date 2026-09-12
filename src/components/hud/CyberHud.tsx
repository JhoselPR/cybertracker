import { useEffect, useRef } from 'react'
import { useInteractionStore } from '../../hooks/useInteractionStore'
import type { InteractionRuntime } from '../../lib/interaction-bridge'
import { attachPointerInput } from '../../lib/hud-interaction'
import { HudButton } from './HudButton'
import { HudPanel } from './HudPanel'
import { SpatialCursor } from './SpatialCursor'

const PANEL_CONTENT: Record<string, readonly string[]> = {
  system: ['STATUS ONLINE', 'SESSION ACTIVE', 'INTERFACE NOMINAL'],
  vision: ['HAND TRACKING ACTIVE', 'GESTURE ENGINE ACTIVE'],
  hardware: ['CAMERA ACTIVE', 'INPUT SPATIAL'],
  network: ['LOCAL PROCESSING ACTIVE', 'EXTERNAL CONNECTION NONE'],
}

interface CyberHudProps {
  runtime: InteractionRuntime
}

export function CyberHud({ runtime }: CyberHudProps) {
  const snapshot = useInteractionStore(runtime)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const disconnectBounds = runtime.kernel.connect()
    const detachPointer = attachPointerInput(node, runtime)
    return () => {
      detachPointer()
      disconnectBounds()
    }
  }, [runtime])

  return (
    <div ref={rootRef} className="cyber-hud">
      <div className="hud-atmosphere" aria-hidden="true" />
      <div className="hud-frame" aria-hidden="true">
        <span className="frame-corner frame-corner-nw" />
        <span className="frame-corner frame-corner-ne" />
        <span className="frame-corner frame-corner-sw" />
        <span className="frame-corner frame-corner-se" />
        <span className="central-zone"><i /></span>
      </div>

      <nav className="hud-controls" aria-label="System panels">
        {Object.keys(PANEL_CONTENT).map((id) => {
          const targetId = `panel-open:${id}`
          return (
            <HudButton
              key={id}
              runtime={runtime}
              id={targetId}
              label={id.toUpperCase()}
              className={`hud-control hud-control-${id}`}
              hovered={snapshot.hoveredId === targetId}
              pressed={snapshot.pressedId === targetId}
              captured={snapshot.capturedId === targetId}
              dragging={snapshot.dragTargetId === targetId}
              onActivate={() => runtime.kernel.openPanel(id)}
            />
          )
        })}
      </nav>

      <div className="hud-readout" aria-hidden="true">
        <span>CYBERTRACKER // INPUT MATRIX</span>
        {snapshot.hoveredId && <strong>TARGET LOCKED</strong>}
      </div>

      <HudButton
        runtime={runtime}
        id="debug-toggle"
        label={`${snapshot.debug ? 'Hide' : 'Show'} diagnostics`}
        className="debug-toggle"
        zRank={5000}
        hovered={snapshot.hoveredId === 'debug-toggle'}
        pressed={snapshot.pressedId === 'debug-toggle'}
        captured={snapshot.capturedId === 'debug-toggle'}
        dragging={snapshot.dragTargetId === 'debug-toggle'}
        onActivate={() => runtime.kernel.toggleDebug()}
      >
        <span>DIAGNOSTICS {snapshot.debug ? 'ON' : 'OFF'}</span>
      </HudButton>

      {Object.values(snapshot.panels).filter((panel) => panel.open).map((panel) => (
        <HudPanel
          key={panel.id}
          runtime={runtime}
          panel={panel}
          title={panel.id.toUpperCase()}
          hoveredId={snapshot.hoveredId}
          pressedId={snapshot.pressedId}
          capturedId={snapshot.capturedId}
          dragTargetId={snapshot.dragTargetId}
        >
          <dl>
            {PANEL_CONTENT[panel.id].map((line) => {
              const split = line.lastIndexOf(' ')
              return (
                <div key={line}>
                  <dt>{line.slice(0, split)}</dt>
                  <dd>{line.slice(split + 1)}</dd>
                </div>
              )
            })}
          </dl>
        </HudPanel>
      ))}

      <SpatialCursor runtime={runtime} />
    </div>
  )
}
