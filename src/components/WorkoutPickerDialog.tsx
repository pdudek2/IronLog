import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import type { WorkoutTemplate } from '../lib/templateService'
import { pluralize } from '../lib/pluralize'

export interface WorkoutSelectionKey {
  templateId: string
  dayIndex: number
}

interface WorkoutPickerDialogProps {
  templates: WorkoutTemplate[]
  selected: WorkoutSelectionKey | null
  onChoose: (selection: WorkoutSelectionKey) => void
  onCancel: () => void
  onEdit: (templateId: string) => void
}

export default function WorkoutPickerDialog({
  templates,
  selected,
  onChoose,
  onCancel,
  onEdit,
}: WorkoutPickerDialogProps) {
  const [draft, setDraft] = useState<WorkoutSelectionKey | null>(selected)
  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLButtonElement>(null)
  useDialogA11y({ containerRef: dialogRef, onClose: onCancel, initialFocusRef })

  return (
    <div className="workout-picker-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="workout-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-picker-title"
      >
        <header className="workout-picker-head">
          <div>
            <p>From your plans</p>
            <h2 id="workout-picker-title">Choose a workout</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close workout picker">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="workout-picker-plans">
          {templates.map((template) => (
            <section key={template.id} className="workout-picker-plan" aria-labelledby={`workout-picker-plan-${template.id}`}>
              <h3 id={`workout-picker-plan-${template.id}`}>{template.name}</h3>
              <div className="workout-picker-days">
                {template.days.map((day, dayIndex) => {
                  const launchable = day.exercises.length > 0
                  const chosen = draft?.templateId === template.id && draft.dayIndex === dayIndex
                  return (
                    <button
                      key={`${template.id}:${dayIndex}`}
                      ref={chosen ? initialFocusRef : undefined}
                      type="button"
                      className="workout-picker-day"
                      aria-label={launchable
                        ? `Select ${day.name} from plan ${template.name}`
                        : `${day.name} from plan ${template.name}, no exercises`}
                      aria-pressed={launchable ? chosen : undefined}
                      disabled={!launchable}
                      onClick={() => setDraft({ templateId: template.id, dayIndex })}
                    >
                      <strong>{day.name}</strong>
                      <span>{launchable
                        ? `${day.exercises.length} ${pluralize(day.exercises.length, 'exercise', 'exercises')}`
                        : 'No exercises'}</span>
                    </button>
                  )
                })}
              </div>
              {template.days.every((day) => day.exercises.length === 0) && (
                <button
                  type="button"
                  className="workout-picker-edit"
                  aria-label={`Edit plan ${template.name}`}
                  onClick={() => onEdit(template.id)}
                >
                  Edit plan
                </button>
              )}
            </section>
          ))}
        </div>

        <footer className="workout-picker-actions">
          <button type="button" className="planner-secondary-action" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="planner-primary-action"
            disabled={!draft}
            onClick={() => draft && onChoose(draft)}
          >
            Choose workout
          </button>
        </footer>
      </div>
    </div>
  )
}
