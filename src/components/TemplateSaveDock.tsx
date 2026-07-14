import { Check, Pencil } from 'lucide-react'

export interface TemplateSaveDockProps {
  dirty: boolean
  saving: boolean
  isEdit: boolean
}

export default function TemplateSaveDock({ dirty, saving, isEdit }: TemplateSaveDockProps) {
  const state = saving ? 'saving' : dirty ? 'dirty' : 'clean'
  const label = saving ? 'Zapisuję...' : !dirty ? 'Zapisano' : isEdit ? 'Zapisz zmiany' : 'Zapisz szablon'

  return (
    <div className="template-save-dock" data-state={state} data-testid="template-save-dock">
      <div className="template-save-dock-panel">
        <span className="template-save-dock-status" role="status" aria-live="polite">
          {saving ? 'Trwa zapis' : dirty ? 'Niezapisane zmiany' : 'Wszystkie zmiany zapisane'}
        </span>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="planner-primary-action mobile-touch-target disabled:opacity-60"
        >
          {dirty || saving ? <Pencil size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          {label}
        </button>
      </div>
    </div>
  )
}
