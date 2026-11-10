import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomSheet from './BottomSheet'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { useUserExercises } from '../hooks/useUserExercises'
import { importPlanText } from '../shared/planImport'

const EXAMPLE = 'Upper\nBench press 4x8 60 kg\nPull-up 3x8\n\nLower\nSquat 3x5 @80'

export default function PastePlanSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { state } = useUserExercises(user?.uid ?? null)
  const units = useProfileStore((store) => store.profile?.units)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const helpId = useId()
  const errorId = useId()
  // Own exercises match before the catalogue, so wait for them unless they failed to load; a bare weight needs the units.
  const loading = state.status === 'loading' || !units

  function handleContinue() {
    const userExercises = state.status === 'success'
      ? state.data.map((exercise) => ({ exerciseId: exercise.id, exerciseSource: 'user' as const, name: exercise.name, muscles: exercise.muscles }))
      : []
    const pasted = importPlanText(text, userExercises, units)
    if (!pasted) {
      setError('No exercises found. Write one exercise per line with its sets, like “Bench press 4x8 60 kg”.')
      fieldRef.current?.focus()
      return
    }
    navigate('/templates/new', { state: { pasted } })
  }

  return (
    <BottomSheet title="Paste a plan" onClose={onClose} initialFocusRef={fieldRef}>
      <p id={helpId} className="paste-plan-help">
        Day names on their own line, then one exercise per line with sets, reps and weight. You check the result before saving.
      </p>
      <textarea
        ref={fieldRef}
        className="template-text-input paste-plan-field"
        aria-label="Plan text"
        aria-describedby={error ? `${helpId} ${errorId}` : helpId}
        aria-invalid={error ? true : undefined}
        placeholder={EXAMPLE}
        value={text}
        maxLength={20000}
        onChange={(event) => {
          setText(event.target.value)
          if (error) setError(null)
        }}
      />
      {error && <p id={errorId} role="alert" className="paste-plan-error">{error}</p>}
      <button
        type="button"
        className="planner-primary-action paste-plan-continue disabled:opacity-60"
        disabled={!text.trim() || loading}
        onClick={handleContinue}
      >
        {loading ? 'Loading your exercises…' : 'Continue'}
      </button>
    </BottomSheet>
  )
}
