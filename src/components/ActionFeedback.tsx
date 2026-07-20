import { LoaderCircle } from 'lucide-react'

export type ActionFeedbackStatus = 'pending' | 'error'

export interface ActionFeedbackProps {
  id?: string
  status: ActionFeedbackStatus
  message: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
}

export function ActionFeedback({
  id,
  status,
  message,
  onRetry,
  onDismiss,
  className,
}: ActionFeedbackProps) {
  const classes = ['action-feedback', `action-feedback--${status}`, className].filter(Boolean).join(' ')

  if (status === 'pending') {
    return (
      <div id={id} className={classes} role="status" aria-live="polite">
        <LoaderCircle className="action-feedback-spinner" data-testid="action-feedback-spinner" aria-hidden="true" size={16} />
        <span>{message}</span>
      </div>
    )
  }

  return (
    <div id={id} className={classes} role="alert">
      <span>{message}</span>
      {(onRetry || onDismiss) && (
        <div className="action-feedback-actions">
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Spróbuj ponownie
            </button>
          )}
          {onDismiss && (
            <button type="button" onClick={onDismiss}>
              Zamknij
            </button>
          )}
        </div>
      )}
    </div>
  )
}
