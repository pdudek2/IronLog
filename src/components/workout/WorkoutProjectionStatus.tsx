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
      <p>Statystyki oczekują na synchronizację.</p>
      {state === 'failed' && (
        <p className="workout-projection-status-error">
          Automatyczna synchronizacja nie powiodła się.
        </p>
      )}
      {state !== 'idle' && (
        <button
          type="button"
          className="workout-projection-retry"
          onClick={onRetry}
          disabled={state === 'retrying'}
        >
          {state === 'retrying' ? 'Synchronizowanie…' : 'Ponów synchronizację'}
        </button>
      )}
    </div>
  )
}
