import type { TrackerStatus } from '../types/tracking'

interface StatusOverlayProps {
  status: Exclude<TrackerStatus, { kind: 'ready' }>
  onRetry: () => void
}

export function StatusOverlay({ status, onRetry }: StatusOverlayProps) {
  const isLoading = status.kind === 'loading'

  return (
    <section className="status-overlay" role={isLoading ? 'status' : 'alert'}>
      {isLoading && <div className="status-mark" aria-hidden="true" />}
      <p>{status.message}</p>
      {!isLoading && (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </section>
  )
}
