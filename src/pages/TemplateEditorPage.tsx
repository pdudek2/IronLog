import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '../components/AppShell'
import ExercisePicker from '../components/ExercisePicker'
import { LoadingState } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import type { ExerciseSource } from '../store/workoutStore'
import { getUserExercises } from '../lib/userExercisesService'
import {
  createTemplate,
  getTemplate,
  updateTemplate,
  type TemplateDay,
  type TemplateExercise,
  type WorkoutTemplate,
} from '../lib/templateService'
import type { Exercise } from '../data/exercises'

type DraftDay = TemplateDay

function emptyDay(index: number): DraftDay {
  return {
    name: `Dzień ${index + 1}`,
    exercises: [],
  }
}

function toPositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(fallback, parsed) : fallback
}

function toPositiveFloat(value: string, fallback: number) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(fallback, parsed) : fallback
}

export default function TemplateEditorPage() {
  const { user } = useAuthStore()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const isEdit = Boolean(id)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null)
  const [name, setName] = useState('')
  const [days, setDays] = useState<DraftDay[]>([emptyDay(0)])
  const [pickerDayIndex, setPickerDayIndex] = useState<number | null>(null)
  const [userExercises, setUserExercises] = useState<Exercise[]>([])

  useEffect(() => {
    if (!user) return
    getUserExercises(user.uid).then(setUserExercises).catch(() => {})
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
        setDays(nextTemplate.days.length ? nextTemplate.days : [emptyDay(0)])
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

  const totalExercises = useMemo(
    () => days.reduce((sum, day) => sum + day.exercises.length, 0),
    [days],
  )

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
        exercises: day.exercises,
      })),
    }

    try {
      if (isEdit && id) {
        await updateTemplate(id, payload)
        toast.success('Szablon zaktualizowany')
      } else {
        await createTemplate(user.uid, payload)
        toast.success('Szablon zapisany')
      }
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
    <AppShell current="templates">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>
            Planowanie
          </p>
          <h1 className="page-title">{isEdit ? 'Edytuj szablon' : 'Nowy szablon'}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Złóż dni treningowe z gotowych ćwiczeń, ustaw docelową liczbę serii i prefill pod start nowej sesji.
          </p>
        </div>

        <button
          onClick={() => navigate('/templates')}
          className="rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'white' }}
        >
          Wróć
        </button>
      </div>

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
              <section key={dayIndex} className="surface-panel rounded-[var(--radius-xl)] p-5">
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
                      style={{ background: 'rgba(255,87,87,0.08)', border: '1px solid rgba(255,87,87,0.18)', color: '#FF5757' }}
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
                          style={{ background: 'rgba(255,87,87,0.08)', border: '1px solid rgba(255,87,87,0.18)', color: '#FF5757' }}
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
                            value={exercise.sets}
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
                            value={exercise.targetReps}
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
                            value={exercise.targetWeight}
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
              background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
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
    </AppShell>
  )
}
