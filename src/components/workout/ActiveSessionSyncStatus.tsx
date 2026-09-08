export type ActiveSessionSyncStatusValue = 'idle' | 'retrying' | 'failed' | 'conflict'

interface ActiveSessionSyncStatusProps {
  status: ActiveSessionSyncStatusValue
  onRetry: () => void
  onReload: () => void
}

export function ActiveSessionSyncStatus({ status, onRetry, onReload }: ActiveSessionSyncStatusProps) {
  if (status === 'idle') return null

  const conflict = status === 'conflict'
  const retrying = status === 'retrying'
  return (
    <div
      className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4"
      role="alert"
      style={{ borderColor: 'var(--danger)' }}
    >
      <p className="text-sm font-semibold text-white">
        {conflict
          ? 'The session changed on another device.'
          : 'Could not sync the active session.'}
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
        {conflict
          ? 'A newer version is available on the server. Loading it will replace unsaved changes on this device.'
          : 'Your data is saved on this device. Retry saving or wait for the server to sync.'}
      </p>
      <button
        type="button"
        onClick={conflict ? onReload : onRetry}
        disabled={retrying}
        className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
      >
        {conflict ? 'Load newer version' : retrying ? 'Syncing…' : 'Retry sync'}
      </button>
    </div>
  )
}
