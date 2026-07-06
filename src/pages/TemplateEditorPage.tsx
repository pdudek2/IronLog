import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import ExercisePicker from '../components/ExercisePicker'
import ConfirmDialog from '../components/ConfirmDialog'
import { LoadingState } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import type { ExerciseSource } from '../store/workoutStore'
import { getUserExercises } from '../lib/userExercisesService'
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
import type { Exercise } from '../data/exercises'

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
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  const [name, setName] = useState(() => initialDraft?.name ?? '')
  const [days, setDays] = useState<DraftDay[]>(() => (
    initialDraft?.days.length
      ? initialDraft.days.map((day) => ({ ...day, _id: crypto.randomUUID() }))
      : [emptyDay(0)]
  ))
  const [pickerDayIndex, setPickerDayIndex] = useState<number | null>(null)
  const [userExercises, setUserExercises] = useState<Exercise[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeDraftState(
    initialDraft?.name ?? '',
    initialDraft?.days.length ? initialDraft.days : defaultSerializableDays(),
  ))
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    getUserExercises(user.uid)
      .then(setUserExercises)
      .catch(() => toast.error('Nie udało się wczytać Twoich ćwiczeń.'))
  }, [user])

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

  useEffect(() => {
    if (!hasUnsavedChanges || saving) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges, saving])

  function handleBackToTemplates() {
    if (hasUnsavedChanges && !saving) {
      setConfirmLeaveOpen(true)
      return
    }

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return

    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      toast.error('Nazwa szablonu musi mieć co najmniej 2 znaki.')
      return
    }

    if (days.every((day) => day.exercises.length === 0)) {
      toast.error('Dodaj przynajmniej jedno ćwiczenie do szablonu.')
      return
    }

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
      navigate('/templates')
    } catch {
      toast.error('Nie udało się zapisać szablonu.')
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingState message="Ładowanie edytora..." />
  }

  return (
    <>
      <section className="hero-editorial">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-5">
            <p className="hero-editorial-date">Planowanie · edytor</p>

            <div>
              <h1 className="hero-editorial-name">
                {isEdit ? (
                  <>
                    Edytuj
                    <br />
                    szablon.
                  </>
                ) : (
                  <>
                    Nowy
                    <br />
                    szablon.
                  </>
                )}
              </h1>
            </div>

            <p className="hero-editorial-sub">
              Złóż dni treningowe z gotowych ćwiczeń, ustaw serie i przygotuj szybszy start kolejnej sesji.
            </p>
          </div>

          <button
            type="button"
            onClick={handleBackToTemplates}
            className="rounded-[var(--radius-pill)] px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'white' }}
          >
            Wróć
          </button>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)]">
          <main className="min-w-0 space-y-5">
            <section className="surface-panel rounded-[var(--radius-xl)] p-5">
              <p className="eyebrow mb-4">Nazwa szablonu</p>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="np. Upper / Lower 4 dni"
                className="w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none text-white"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
              />
            </section>

            {days.map((day, dayIndex) => (
              <section key={day._id} className="surface-panel rounded-[var(--radius-xl)] p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">Dzień {dayIndex + 1}</p>
                    <input
                      type="text"
                      value={day.name}
                      onChange={(event) => updateDay(dayIndex, { ...day, name: event.target.value })}
                      className="mt-3 w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none text-white"
                      style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                    />
                  </div>

                  {days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDay(dayIndex)}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold"
                      style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-soft-strong)', color: 'var(--danger)' }}
                    >
                      <Trash2 size={13} />
                      Usuń dzień
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {day.exercises.map((exercise, exerciseIndex) => (
                    <div
                      key={`${dayIndex}-${exercise.exerciseSource}-${exercise.exerciseId}`}
                      className="rounded-[var(--radius-lg)] border p-4"
                      style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}
                    >
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-white">{exercise.name}</p>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{
                                background: exercise.exerciseSource === 'user' ? 'var(--accent-soft)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${exercise.exerciseSource === 'user' ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
                                color: exercise.exerciseSource === 'user' ? 'var(--accent)' : 'var(--muted)',
                              }}
                            >
                              {exercise.exerciseSource === 'user' ? 'moje' : 'global'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeExercise(dayIndex, exerciseIndex)}
                          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold"
                          style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-soft-strong)', color: 'var(--danger)' }}
                        >
                          <Trash2 size={13} />
                          Usuń
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="flex flex-col gap-2">
                          <span className="stat-meta">Serie</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={exercise.sets === 0 ? '' : exercise.sets}
                            onChange={(event) => updateExercise(dayIndex, exerciseIndex, (current) => ({
                              ...current,
                              sets: toPositiveInt(event.target.value, 1),
                            }))}
                            className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-white outline-none"
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                          />
                        </label>

                        <label className="flex flex-col gap-2">
                          <span className="stat-meta">Powt. docelowe</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={exercise.targetReps === 0 ? '' : exercise.targetReps}
                            onChange={(event) => updateExercise(dayIndex, exerciseIndex, (current) => ({
                              ...current,
                              targetReps: toPositiveInt(event.target.value, 0),
                            }))}
                            className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-white outline-none"
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                          />
                        </label>

                        <label className="flex flex-col gap-2">
                          <span className="stat-meta">Ciężar startowy</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.5"
                            value={exercise.targetWeight === 0 ? '' : exercise.targetWeight}
                            onChange={(event) => updateExercise(dayIndex, exerciseIndex, (current) => ({
                              ...current,
                              targetWeight: toPositiveFloat(event.target.value, 0),
                            }))}
                            className="rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-white outline-none"
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                          />
                        </label>
                      </div>
                    </div>
                  ))}

                  {day.exercises.length === 0 && (
                    <div
                      className="rounded-[var(--radius-lg)] border border-dashed px-4 py-6 text-sm"
                      style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'rgba(255,255,255,0.02)' }}
                    >
                      Ten dzień jest pusty. Dodaj ćwiczenia, żeby móc uruchamiać gotową sesję.
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <motion.button
                    type="button"
                    onClick={() => setPickerDayIndex(dayIndex)}
                    className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'white' }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={15} />
                    Dodaj ćwiczenie
                  </motion.button>
                </div>
              </section>
            ))}
          </main>

          <aside className="desktop-sticky hidden xl:block space-y-4">
            <div className="surface-panel rounded-[var(--radius-xl)] p-5">
              <p className="eyebrow mb-4" style={{ color: 'var(--accent)' }}>
                Podsumowanie
              </p>
              <div className="grid gap-3">
                <div className="metric-card p-4">
                  <p className="stat-meta">Dni</p>
                  <p className="mt-3 text-2xl font-semibold text-white tabular-nums">{days.length}</p>
                </div>
                <div className="metric-card p-4">
                  <p className="stat-meta">Ćwiczenia</p>
                  <p className="mt-3 text-2xl font-semibold text-white tabular-nums">{totalExercises}</p>
                </div>
                <div className="rounded-[var(--radius-lg)] border p-4" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                  <p className="text-sm font-semibold text-white">
                    {(template?.name ?? name.trim()) || 'Nowy plan'}
                  </p>
                  <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    Każdy dzień zapisuje zestaw ćwiczeń z domyślnymi seriami, powtórzeniami i ciężarem startowym pod nową aktywną sesję.
                  </p>
                </div>
              </div>
            </div>

            <motion.button
              type="button"
              onClick={addDay}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] py-3 text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'white' }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={15} />
              Dodaj dzień
            </motion.button>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <motion.button
            type="button"
            onClick={addDay}
            className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold xl:hidden"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'white' }}
            whileTap={{ scale: 0.97 }}
          >
            <Plus size={15} />
            Dodaj dzień
          </motion.button>

          <motion.button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] px-5 py-3 text-sm font-semibold disabled:opacity-60"
            style={{
              background: 'var(--primary-gradient)',
              color: 'var(--accent-foreground)',
            }}
            whileTap={{ scale: 0.97 }}
          >
            <Pencil size={15} />
            {saving ? 'Zapisuję...' : isEdit ? 'Zapisz zmiany' : 'Zapisz szablon'}
          </motion.button>
        </div>
      </form>

      {pickerDayIndex !== null && (
        <ExercisePicker
          userExercises={userExercises}
          onClose={() => setPickerDayIndex(null)}
          onSelect={(exerciseId, exerciseName, source) => addExerciseToDay(pickerDayIndex, exerciseId, exerciseName, source)}
        />
      )}

      {confirmLeaveOpen && (
        <ConfirmDialog
          title="Opuścić edytor?"
          message="Masz niezapisane zmiany w szablonie. Jeśli wyjdziesz teraz, stracisz bieżące poprawki."
          confirmLabel="Opuść bez zapisu"
          cancelLabel="Zostań"
          danger
          onConfirm={() => {
            setConfirmLeaveOpen(false)
            navigate('/templates')
          }}
          onCancel={() => setConfirmLeaveOpen(false)}
        />
      )}
    </>
  )
}
