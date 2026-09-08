export type ProjectionRetryState = 'idle' | 'retrying' | 'failed'

interface WorkoutProjectionStatusProps {
  state: ProjectionRetryState
  onRetry: () => void
}

export default function WorkoutProjectionStatus({
  state,
  onRetry,
}: WorkoutProjectionStatusProps) {
  return (
    <div className="workout-projection-status" role="status">
      <p>Stats are waiting to sync.</p>
      {state === 'failed' && (
        <p className="workout-projection-status-error">
          Automatic sync failed.
        </p>
      )}
      {state !== 'idle' && (
        <button
          type="button"
          className="workout-projection-retry"
          onClick={onRetry}
          disabled={state === 'retrying'}
        >
          {state === 'retrying' ? 'Syncing…' : 'Retry sync'}
        </button>
      )}
    </div>
  )
}
