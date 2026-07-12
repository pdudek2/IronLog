export type ActiveSessionSyncStatusValue = 'idle' | 'retrying' | 'failed'

interface ActiveSessionSyncStatusProps {
  status: ActiveSessionSyncStatusValue
  onRetry: () => void
}

export function ActiveSessionSyncStatus({ status, onRetry }: ActiveSessionSyncStatusProps) {
  if (status === 'idle') return null

  const retrying = status === 'retrying'
  return (
    <div
      className="surface-panel mb-4 rounded-[var(--radius-xl)] border p-4"
      role="alert"
      style={{ borderColor: 'var(--danger)' }}
    >
      <p className="text-sm font-semibold text-white">
        Nie udało się zsynchronizować aktywnej sesji.
      </p>
      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
        Dane są zachowane na tym urządzeniu. Ponów zapis lub poczekaj na uzgodnienie z serwerem.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--primary-gradient)', color: 'var(--accent-foreground)' }}
      >
        {retrying ? 'Synchronizuję…' : 'Ponów synchronizację'}
      </button>
    </div>
  )
}
