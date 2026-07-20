import { Check, Pencil } from 'lucide-react'
import { ActionFeedback } from './ActionFeedback'

export type TemplateSaveState =
  | 'new-pristine'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'persisted-clean'

export interface TemplateSaveDockProps {
  state: TemplateSaveState
  isEdit: boolean
  canSubmit: boolean
  errorMessage?: string
  onRetry?: () => void
  onDismissError?: () => void
}

const statusLabels: Record<Exclude<TemplateSaveState, 'error'>, string> = {
  'new-pristine': 'Nowy plan · jeszcze niezapisany',
  dirty: 'Niezapisane zmiany',
  saving: 'Trwa zapis',
  'persisted-clean': 'Wszystkie zmiany zapisane',
}

export default function TemplateSaveDock({
  state,
  isEdit,
  canSubmit,
  errorMessage,
  onRetry,
  onDismissError,
}: TemplateSaveDockProps) {
  const saving = state === 'saving'
  const persisted = state === 'persisted-clean'
  const hasError = state === 'error'
  const label = saving
    ? 'Zapisuję…'
    : persisted
      ? 'Zapisano'
      : isEdit
        ? 'Zapisz zmiany'
        : 'Zapisz szablon'

  return (
    <div className="template-save-dock" data-state={state} data-testid="template-save-dock">
      {hasError && errorMessage && (
        <ActionFeedback
          status="error"
          message={errorMessage}
          onRetry={onRetry}
          onDismiss={onDismissError}
          className="template-save-dock-feedback"
        />
      )}
      <div className="template-save-dock-panel">
        {!hasError && (
          <span className="template-save-dock-status" role="status" aria-live="polite">
            {statusLabels[state]}
          </span>
        )}
        <button
          type="submit"
          disabled={!canSubmit || saving || persisted || hasError}
          className="planner-primary-action mobile-touch-target disabled:opacity-60"
        >
          {persisted ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
          {label}
        </button>
      </div>
    </div>
  )
}
