import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import type { InteractionRuntime } from '../../lib/interaction-bridge'
import type { TargetKind } from '../../lib/hud-interaction'

interface HudButtonProps {
  runtime: InteractionRuntime
  id: string
  label: string
  hovered: boolean
  pressed: boolean
  captured?: boolean
  dragging?: boolean
  disabled?: boolean
  zRank?: number
  kind?: TargetKind
  onActivate: () => void
  className?: string
  children?: ReactNode
}

export function HudButton({
  runtime,
  id,
  label,
  hovered,
  pressed,
  captured = false,
  dragging = false,
  disabled = false,
  zRank = 100,
  kind = 'button',
  onActivate,
  className = '',
  children,
}: HudButtonProps) {
  const nodeRef = useRef<HTMLButtonElement | null>(null)
  const activateRef = useRef(onActivate)
  useEffect(() => {
    activateRef.current = onActivate
  }, [onActivate])

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return
    return runtime.kernel.registerTarget({
      id,
      kind,
      zRank,
      enabled: !disabled,
      element: node,
      getBounds: () => node.getBoundingClientRect(),
      activate: () => activateRef.current(),
    })
  }, [disabled, id, kind, runtime, zRank])

  const handleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0 && !disabled) activateRef.current()
  }, [disabled])

  return (
    <button
      ref={nodeRef}
      type="button"
      className={`hud-button ${className}`}
      data-target-id={id}
      data-hovered={hovered || undefined}
      data-pressed={pressed || undefined}
      data-captured={captured || undefined}
      data-dragging={dragging || undefined}
      disabled={disabled}
      aria-label={label}
      onClick={handleClick}
    >
      {children ?? <span>{label}</span>}
    </button>
  )
}
