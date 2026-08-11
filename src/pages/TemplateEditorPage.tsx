import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import ExercisePicker from '../components/ExercisePicker'
import ConfirmDialog from '../components/ConfirmDialog'
import TemplateSaveDock, { type TemplateSaveState } from '../components/TemplateSaveDock'
import { LoadingState } from '../components/ui'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'
import { useUserExercises } from '../hooks/useUserExercises'
import { useAuthStore } from '../store/authStore'
import type { ExerciseSource } from '../store/workoutStore'
import {
  clearTemplateDraft,
  readTemplateDraft,
} from '../lib/templateDraftStorage'
import {
  createTemplate,
  getTemplate,
  updateTemplate,
  type TemplateDay,
  type TemplateExercise,
  type WorkoutTemplate,
} from '../lib/templateService'

type DraftDay = TemplateDay & { _id: string }

function emptyDay(index: number): DraftDay {
  return {
    _id: crypto.randomUUID(),
    name: `Dzień ${index + 1}`,
    exercises: [],
  }
}

function toPositiveInt(value: string, fallback: number) {
  if (value.trim() === '') return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(fallback, parsed) : fallback
}

function toPositiveFloat(value: string, fallback: number) {
  if (value.trim() === '') return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(fallback, parsed) : fallback
}

function serializeDraftState(name: string, days: Array<Pick<TemplateDay, 'name' | 'exercises'>>) {
  return JSON.stringify({
    name,
    days: days.map((day) => ({
      name: day.name,
      exercises: day.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        exerciseSource: exercise.exerciseSource,
        name: exercise.name,
        sets: exercise.sets,
        targetReps: exercise.targetReps,
        targetWeight: exercise.targetWeight,
      })),
    })),
  })
}

function defaultSerializableDays(): TemplateDay[] {
  return [{ name: 'Dzień 1', exercises: [] }]
}

function normalizeTemplateExercise(exercise: TemplateExercise): TemplateExercise {
  return {
    ...exercise,
    sets: Math.max(1, Math.trunc(exercise.sets) || 1),
    targetReps: Math.max(0, Math.trunc(exercise.targetReps) || 0),
    targetWeight: Math.max(0, Number.isFinite(exercise.targetWeight) ? exercise.targetWeight : 0),
  }
}

export default function TemplateEditorPage() {
  const { user } = useAuthStore()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [initialDraft] = useState(() => (
    !id && searchParams.get('draft') === 'ai' ? readTemplateDraft() : null
  ))

  const isEdit = Boolean(id)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  const [name, setName] = useState(() => initialDraft?.name ?? '')
  const [days, setDays] = useState<DraftDay[]>(() => (
    initialDraft?.days.length
      ? initialDraft.days.map((day) => ({ ...day, _id: crypto.randomUUID() }))
      : [emptyDay(0)]
  ))
  const [pickerDayIndex, setPickerDayIndex] = useState<number | null>(null)
  const {
    state: userExercisesState,
    retry: retryUserExercises,
  } = useUserExercises(user?.uid ?? null)
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeDraftState(
    '',
    defaultSerializableDays(),
  ))

  useEffect(() => {
    if (!isEdit || !id) return

    let cancelled = false

    getTemplate(id)
      .then((nextTemplate) => {
        if (cancelled) return
        if (!nextTemplate) {
          toast.error('Nie znaleziono szablonu.')
          navigate('/templates', { replace: true })
          return
        }

        setTemplate(nextTemplate)
        setName(nextTemplate.name)
        const loadedDays = nextTemplate.days.length
          ? nextTemplate.days.map((day) => ({ ...day, _id: crypto.randomUUID() }))
          : [emptyDay(0)]

        setDays(loadedDays)
        setSavedSnapshot(serializeDraftState(nextTemplate.name, loadedDays))
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Nie udało się załadować szablonu.')
          navigate('/templates', { replace: true })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, isEdit, navigate])

  useEffect(() => {
    if (isEdit || searchParams.get('draft') !== 'ai') return

    if (!initialDraft) {
      toast.message('Nie znaleziono draftu AI. Możesz złożyć szablon ręcznie.')
      return
    }

    toast.success('Załadowano draft wygenerowany przez AI.')
  }, [initialDraft, isEdit, searchParams])

  const totalExercises = useMemo(
    () => days.reduce((sum, day) => sum + day.exercises.length, 0),
    [days],
  )
  const currentSnapshot = useMemo(() => serializeDraftState(name, days), [name, days])
  const hasUnsavedChanges = !loading && currentSnapshot !== savedSnapshot
  const canSubmit = name.trim().length >= 2
    && days.some((day) => day.exercises.length > 0)
  const saveState: TemplateSaveState = saving
    ? 'saving'
    : saveError
      ? 'error'
      : hasUnsavedChanges
        ? 'dirty'
        : template
          ? 'persisted-clean'
          : 'new-pristine'
  const leaveGuard = useUnsavedChangesGuard(hasUnsavedChanges || saving)

  function handleBackToTemplates() {
    navigate('/templates')
  }

  function updateDay(index: number, nextDay: DraftDay) {
    setDays((prev) => prev.map((day, dayIndex) => (dayIndex === index ? nextDay : day)))
  }

  function addDay() {
    setDays((prev) => [...prev, emptyDay(prev.length)])
  }

  function removeDay(index: number) {
    setDays((prev) => {
      if (prev.length === 1) return prev
      return prev
        .filter((_, dayIndex) => dayIndex !== index)
        .map((day, dayIndex) => ({
          ...day,
          name: day.name.trim() || `Dzień ${dayIndex + 1}`,
        }))
    })
  }

  function addExerciseToDay(dayIndex: number, exerciseId: string, exerciseName: string, source: ExerciseSource) {
    setDays((prev) => prev.map((day, index) => {
      if (index !== dayIndex) return day
      if (day.exercises.some((exercise) => exercise.exerciseId === exerciseId && exercise.exerciseSource === source)) {
        toast.message('To ćwiczenie jest już w tym dniu.')
        return day
      }

      return {
        ...day,
        exercises: [
          ...day.exercises,
          {
            exerciseId,
            exerciseSource: source,
            name: exerciseName,
            sets: 4,
            targetReps: 8,
            targetWeight: 0,
          },
        ],
      }
    }))
    setPickerDayIndex(null)
  }

  function updateExercise(dayIndex: number, exerciseIndex: number, updater: (exercise: TemplateExercise) => TemplateExercise) {
    setDays((prev) => prev.map((day, index) => {
      if (index !== dayIndex) return day
      return {
        ...day,
        exercises: day.exercises.map((exercise, currentExerciseIndex) => (
          currentExerciseIndex === exerciseIndex ? updater(exercise) : exercise
        )),
      }
    }))
  }

  function removeExercise(dayIndex: number, exerciseIndex: number) {
    setDays((prev) => prev.map((day, index) => {
      if (index !== dayIndex) return day
      return {
        ...day,
        exercises: day.exercises.filter((_, currentExerciseIndex) => currentExerciseIndex !== exerciseIndex),
      }
    }))
  }

  async function saveTemplate() {
    if (!user || saving || saveState === 'persisted-clean') return

    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      toast.error('Nazwa szablonu musi mieć co najmniej 2 znaki.')
      return
    }

    if (days.every((day) => day.exercises.length === 0)) {
      toast.error('Dodaj przynajmniej jedno ćwiczenie do szablonu.')
      return
    }

    setSaveError(null)
    setSaving(true)

    const payload = {
      name: trimmedName,
      days: days.map((day, index) => ({
        name: day.name.trim() || `Dzień ${index + 1}`,
        exercises: day.exercises.map(normalizeTemplateExercise),
      })),
    }

    try {
      if (isEdit && id) {
        await updateTemplate(id, payload)
        toast.success('Szablon zaktualizowany')
      } else {
        await createTemplate(user.uid, payload)
        clearTemplateDraft()
        toast.success('Szablon zapisany')
      }
      setSavedSnapshot(serializeDraftState(payload.name, payload.days))
      leaveGuard.reset()
      leaveGuard.allowNextNavigation()
      navigate('/templates')
    } catch {
      setSaveError('Nie udało się zapisać planu.')
      setSaving(false)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveTemplate()
  }

  if (loading) {
    return <LoadingState message="Ładowanie edytora..." />
  }

  return (
    <>
      <section className="planner-header template-editor-header">
        <button
          type="button"
          onClick={handleBackToTemplates}
          className="template-editor-back"
          aria-label="Wróć"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          Plany
        </button>

        <div className="template-editor-heading">
          <h1>{isEdit ? 'Edytuj plan' : 'Nowy plan'}</h1>
          <div className="planner-mini-stats" aria-label="Podsumowanie edytowanego planu">
            <span>
              <strong>{days.length}</strong>
              dni
            </span>
            <span>
              <strong>{totalExercises}</strong>
              ćw.
            </span>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="template-editor-form">
        <div className="template-editor-layout">
          <div className="template-editor-main">
            <section className="template-name-panel">
              <label htmlFor="template-name" className="planner-kicker">Nazwa</label>
              <input
                id="template-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="np. Upper / Lower 4 dni"
                className="template-text-input w-full px-4 py-3 text-sm outline-none text-white"
              />
            </section>

            {days.map((day, dayIndex) => {
              const dayNameInputId = `template-day-name-${day._id}`
              const dayDisplayName = day.name.trim() || `Dzień ${dayIndex + 1}`

              return (
                <section key={day._id} className="template-day-editor">
                <div className="template-day-editor-head">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={dayNameInputId} className="planner-kicker">
                      Dzień {dayIndex + 1}
                    </label>
                    <input
                      id={dayNameInputId}
                      type="text"
                      value={day.name}
                      onChange={(event) => updateDay(dayIndex, { ...day, name: event.target.value })}
                      className="template-text-input mt-2 w-full px-4 py-3 text-sm outline-none text-white"
                    />
                  </div>

                  {days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDay(dayIndex)}
                      className="template-day-remove"
                    >
                      <Trash2 size={13} />
                      Usuń dzień
                    </button>
                  )}
                </div>

                <div className="template-exercise-list">
                  {day.exercises.length > 0 && (
                    <div className="template-exercise-columns" aria-hidden="true">
                      <span>Ćwiczenie</span>
                      <span>Serie</span>
                      <span>Powt.</span>
                      <span>Ciężar</span>
                    </div>
                  )}
                  {day.exercises.map((exercise, exerciseIndex) => (
                    <div
                      key={`${dayIndex}-${exercise.exerciseSource}-${exercise.exerciseId}`}
                      className="template-exercise-row"
                    >
                      <div className="template-exercise-row-head">
                        <div className="min-w-0">
                          <div className="template-exercise-identity">
                            <p>{exercise.name}</p>
                            {exercise.exerciseSource === 'user' && (
                              <span className="template-exercise-source">moje</span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeExercise(dayIndex, exerciseIndex)}
                          aria-label={`Usuń ćwiczenie ${exercise.name} z dnia ${dayDisplayName}`}
                          className="planner-icon-action planner-icon-action--danger"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="template-exercise-inputs">
                        <label>
                          <span className="template-input-label">Serie — {exercise.name}</span>
                          <input
                            type="number"
                            aria-label={`Serie — ${exercise.name}`}
                            inputMode="numeric"
                            min={1}
                            value={exercise.sets === 0 ? '' : exercise.sets}
                            onChange={(event) => updateExercise(dayIndex, exerciseIndex, (current) => ({
                              ...current,
                              sets: toPositiveInt(event.target.value, 1),
                            }))}
                            className="template-number-input px-3 py-2.5 text-sm text-white outline-none"
                          />
                        </label>

                        <label>
                          <span className="template-input-label">Powtórzenia docelowe — {exercise.name}</span>
                          <input
                            type="number"
                            aria-label={`Powtórzenia docelowe — ${exercise.name}`}
                            inputMode="numeric"
                            min={0}
                            value={exercise.targetReps === 0 ? '' : exercise.targetReps}
                            onChange={(event) => updateExercise(dayIndex, exerciseIndex, (current) => ({
                              ...current,
                              targetReps: toPositiveInt(event.target.value, 0),
                            }))}
                            className="template-number-input px-3 py-2.5 text-sm text-white outline-none"
                          />
                        </label>

                        <label>
                          <span className="template-input-label">Ciężar startowy — {exercise.name}</span>
                          <input
                            type="number"
                            aria-label={`Ciężar startowy — ${exercise.name}`}
                            inputMode="decimal"
                            min={0}
                            step="0.5"
                            value={exercise.targetWeight === 0 ? '' : exercise.targetWeight}
                            onChange={(event) => updateExercise(dayIndex, exerciseIndex, (current) => ({
                              ...current,
                              targetWeight: toPositiveFloat(event.target.value, 0),
                            }))}
                            className="template-number-input px-3 py-2.5 text-sm text-white outline-none"
                          />
                        </label>
                      </div>
                    </div>
                  ))}

                  {day.exercises.length === 0 && (
                    <div
                      className="template-day-empty"
                    >
                      Ten dzień jest pusty. Dodaj ćwiczenia, żeby móc uruchamiać gotową sesję.
                    </div>
                  )}
                </div>

                <div className="template-day-actions">
                  <motion.button
                    type="button"
                    onClick={() => setPickerDayIndex(dayIndex)}
                    className="planner-secondary-action template-day-add-exercise"
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={15} />
                    Dodaj ćwiczenie
                  </motion.button>
                </div>
                </section>
              )
            })}
          </div>

          <aside className="desktop-sticky hidden xl:block template-editor-side">
            <div className="template-editor-summary">
              <p className="planner-kicker">Podsumowanie</p>
              <div className="template-editor-summary-grid">
                <div>
                  <span>Dni</span>
                  <strong>{days.length}</strong>
                </div>
                <div>
                  <span>Ćwiczenia</span>
                  <strong>{totalExercises}</strong>
                </div>
              </div>

              <div className="template-editor-summary-note">
                <p>{(template?.name ?? name.trim()) || 'Nowy plan'}</p>
              </div>
            </div>

            <motion.button
              type="button"
              onClick={addDay}
              className="planner-secondary-action template-editor-add-day"
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={15} />
              Dodaj dzień
            </motion.button>
          </aside>
        </div>

        <div className="template-editor-bottom-actions">
          <motion.button
            type="button"
            onClick={addDay}
            className="planner-secondary-action template-editor-mobile-add-day mobile-touch-target"
            whileTap={{ scale: 0.97 }}
          >
            <Plus size={15} />
            Dodaj dzień
          </motion.button>

          <motion.button
            type="submit"
            disabled={!canSubmit || saveState === 'saving' || saveState === 'error' || saveState === 'persisted-clean'}
            aria-label={saveState === 'saving'
              ? 'Zapisuję… w formularzu'
              : saveState === 'persisted-clean'
                ? 'Zapisano w formularzu'
                : isEdit
                  ? 'Zapisz zmiany w formularzu'
                  : 'Zapisz szablon w formularzu'}
            className="planner-primary-action template-editor-desktop-save disabled:opacity-60"
            whileTap={{ scale: 0.97 }}
          >
            <Pencil size={15} />
            {saveState === 'saving'
              ? 'Zapisuję…'
              : saveState === 'persisted-clean'
                ? 'Zapisano'
                : isEdit
                  ? 'Zapisz zmiany'
                  : 'Zapisz szablon'}
          </motion.button>
        </div>
        <TemplateSaveDock
          state={saveState}
          isEdit={isEdit}
          canSubmit={canSubmit}
          errorMessage={saveError ?? undefined}
          onRetry={() => { void saveTemplate() }}
          onDismissError={() => setSaveError(null)}
        />
      </form>

      {pickerDayIndex !== null && (
        <ExercisePicker
          userExercisesState={userExercisesState}
          onRetryUserExercises={retryUserExercises}
          onClose={() => setPickerDayIndex(null)}
          onSelect={(exerciseId, exerciseName, source) => addExerciseToDay(pickerDayIndex, exerciseId, exerciseName, source)}
        />
      )}

      {leaveGuard.blocked && (
        <ConfirmDialog
          title={saving ? 'Zapis w toku' : 'Opuścić edytor?'}
          message={saving
            ? 'Poczekaj na wynik zapisu. Po zakończeniu przejdziesz dalej albo będzie można ponowić zapis.'
            : 'Masz niezapisane zmiany w szablonie. Jeśli wyjdziesz teraz, stracisz bieżące poprawki.'}
          confirmLabel={saving ? 'Zapisuję…' : 'Opuść bez zapisu'}
          cancelLabel="Zostań"
          danger={!saving}
          confirmDisabled={saving}
          onConfirm={leaveGuard.proceed}
          onCancel={leaveGuard.reset}
        />
      )}
    </>
  )
}
