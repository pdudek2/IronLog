import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, ChevronDown, ChevronUp, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, LoadingState } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { useWorkoutStore } from '../store/workoutStore'
import { fetchRemoteSessionHasWork, saveActiveSession } from '../lib/activeSessionService'
import { getExerciseSessions } from '../lib/exerciseDetailService'
import {
  buildActiveWorkoutFromTemplate,
  deleteTemplate,
  getTemplates,
  templateExerciseKey,
  type TemplateExerciseHistoryMap,
  type WorkoutTemplate,
} from '../lib/templateService'

function formatDate(ts: number): string {
  if (!ts) return 'teraz'
  return new Date(ts).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
  })
}

function countTemplateExercises(template: WorkoutTemplate): number {
  return template.days.reduce((sum, day) => sum + day.exercises.length, 0)
}

export default function TemplatesPage() {
  const { user } = useAuthStore()
  const active = useWorkoutStore((state) => state.active)
  const hydrateFromDoc = useWorkoutStore((state) => state.hydrateFromDoc)
  const navigate = useNavigate()

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [launching, setLaunching] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WorkoutTemplate | null>(null)
  const [launchTarget, setLaunchTarget] = useState<{ template: WorkoutTemplate; dayIndex: number } | null>(null)
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getTemplates(user.uid)
      .then((nextTemplates) => {
        setTemplates(nextTemplates)
        setError(false)
      })
      .catch(() => {
        toast.error('Nie udało się pobrać szablonów.')
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [loadAttempt, user])

  function handleRetryLoad() {
    setError(false)
    setLoading(true)
    setLoadAttempt((value) => value + 1)
  }

  const hasActiveWork = useMemo(() => {
    if (!active) return false
    if (active.exercises.length > 0) return true
    return Boolean(active.label?.trim())
  }, [active])
  const plannerStats = useMemo(() => ({
    templates: templates.length,
    days: templates.reduce((sum, template) => sum + template.days.length, 0),
    exercises: templates.reduce((sum, template) => sum + countTemplateExercises(template), 0),
  }), [templates])

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return

    const deletingId = deleteTarget.id
    setDeleteTarget(null)

    try {
      await deleteTemplate(deletingId)
      setTemplates((prev) => prev.filter((template) => template.id !== deletingId))
      toast.success('Szablon usunięty')
    } catch {
      toast.error('Nie udało się usunąć szablonu.')
    }
  }

  async function launchTemplate(template: WorkoutTemplate, dayIndex: number) {
    if (!user) return

    const historyByExercise = await loadTemplateExerciseHistory(user.uid, template, dayIndex)
    const nextWorkout = buildActiveWorkoutFromTemplate(template, dayIndex, historyByExercise)
    hydrateFromDoc(nextWorkout)
    await saveActiveSession(user.uid, nextWorkout)
    toast.success(`Szablon „${template.name}” gotowy do startu`)
    navigate('/workout/new')
  }

  async function handleLaunch(template: WorkoutTemplate, dayIndex: number) {
    if (!user || launching) return
    setLaunching(true)
    try {
      const remoteHasWork = await fetchRemoteSessionHasWork(user.uid)
      if (hasActiveWork || remoteHasWork) {
        setLaunchTarget({ template, dayIndex })
        return
      }
      await launchTemplate(template, dayIndex)
    } finally {
      setLaunching(false)
    }
  }

  async function loadTemplateExerciseHistory(
    uid: string,
    template: WorkoutTemplate,
    dayIndex: number,
  ): Promise<TemplateExerciseHistoryMap> {
    const day = template.days[dayIndex] ?? template.days[0]
    const exercises = day?.exercises ?? []
    const uniqueExercises = Array.from(
      new Map(exercises.map((exercise) => [
        templateExerciseKey(exercise.exerciseId, exercise.exerciseSource),
        exercise,
      ])).values(),
    )

    const entries = await Promise.all(uniqueExercises.map(async (exercise) => {
      try {
        const [last] = await getExerciseSessions(uid, exercise.exerciseId, exercise.exerciseSource, 1)
        if (!last || last.bestSetWeight <= 0) return null
        return [
          templateExerciseKey(exercise.exerciseId, exercise.exerciseSource),
          { bestSetWeight: last.bestSetWeight, bestSetReps: last.bestSetReps },
        ] as const
      } catch {
        return null
      }
    }))

    return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null))
  }

  if (loading) {
    return <LoadingState message="Ładowanie szablonów..." />
  }

  return (
    <>
      <section className="planner-header">
        <div>
          <p className="planner-kicker">Plany</p>
          <h1>Plany.</h1>
          <p>Rozpiski, dni treningowe i szybki start sesji w jednym widoku.</p>
        </div>

        <div className="planner-header-actions">
          <div className="planner-mini-stats" aria-label="Podsumowanie planów">
            <span>
              <strong>{plannerStats.templates}</strong>
              plany
            </span>
            <span>
              <strong>{plannerStats.days}</strong>
              dni
            </span>
            <span>
              <strong>{plannerStats.exercises}</strong>
              ćw.
            </span>
          </div>

          <motion.button
            type="button"
            onClick={() => navigate('/templates/new')}
            className="planner-primary-action"
            whileTap={{ scale: 0.97 }}
          >
            <Plus size={16} />
            Nowy plan
          </motion.button>
        </div>
      </section>

      <AnimatePresence mode="popLayout">
        {error ? (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-10 text-center"
            initial={false}
            animate={{ opacity: 1 }}
          >
            <p className="text-lg font-semibold text-white">Nie udało się pobrać szablonów</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Sprawdź połączenie i spróbuj ponownie bez odświeżania strony.
            </p>
            <Button type="button" className="mt-6 min-w-[12rem]" onClick={handleRetryLoad}>
              Spróbuj ponownie
            </Button>
          </motion.div>
        ) : templates.length === 0 ? (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-6 sm:p-8"
            initial={false}
            animate={{ opacity: 1 }}
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-center">
              <div className="text-center lg:text-left">
                <div
                  className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] lg:mx-0"
                  style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }}
                >
                  <CalendarDays size={24} />
                </div>
                <p className="text-2xl font-semibold text-white">Nie masz jeszcze szablonów</p>
                <p className="mt-3 max-w-xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                  Pierwszy szablon skróci wejście w sesję i pozwoli startować z gotową rozpiską.
                </p>

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {[
                    'Szybszy start dnia',
                    'Stały układ serii',
                    'Mniej klikania przed sesją',
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-[var(--radius-lg)] border px-4 py-3 text-sm"
                      style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)', color: 'var(--muted)' }}
                    >
                      {item}
                    </div>
                  ))}
                </div>

                <motion.button
                  onClick={() => navigate('/templates/new')}
                  className="mt-6 rounded-[var(--radius-lg)] px-5 py-3 text-sm font-semibold"
                  style={{
                    background: 'var(--primary-gradient)',
                    color: 'var(--accent-foreground)',
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  Utwórz pierwszy szablon
                </motion.button>
              </div>

              <div
                className="rounded-[var(--radius-xl)] border p-4"
                style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
              >
                <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>
                  Przykład
                </p>
                <p className="text-lg font-semibold text-white">Upper / Lower · 4 dni</p>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                  Szablon trzyma rytm tygodnia i przypisuje każdemu dniowi gotowy zestaw ćwiczeń.
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    'Upper A · Bench Press · Row · OHP',
                    'Lower A · Squat · RDL · Leg Press',
                    'Upper B · Incline · Pull-up · Lateral Raise',
                  ].map((day) => (
                    <div
                      key={day}
                      className="rounded-[var(--radius-lg)] border px-3 py-2.5 text-sm"
                      style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    >
                      {day}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="template-board planner-template-board">
            {templates.map((template, index) => {
              const totalExercises = countTemplateExercises(template)
              const expanded = expandedTemplateId === template.id
              return (
                <motion.article
                  key={template.id}
                  className="template-card planner-template-row"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.2 }}
                >
                  <div className="planner-template-main">
                    <div className="planner-template-title">
                      <span>Plan</span>
                      <h2>
                        {template.name}
                      </h2>
                      <p>
                        {template.days.length} {template.days.length === 1 ? 'dzień' : 'dni'} · {totalExercises} {totalExercises === 1 ? 'ćwiczenie' : 'ćwiczeń'} · aktualizacja {formatDate(template.updatedAt)}
                      </p>
                    </div>

                    <div className="planner-template-days" aria-label={`Dni planu ${template.name}`}>
                      {template.days.map((day, dayIndex) => (
                        <button
                          key={`${template.id}-summary-${dayIndex}`}
                          type="button"
                          className="planner-day-chip"
                          onClick={() => void handleLaunch(template, dayIndex)}
                          disabled={launching}
                        >
                          <span>{day.name}</span>
                          <small>{day.exercises.length} ćw.</small>
                        </button>
                      ))}
                    </div>

                    <div className="planner-template-actions">
                      <motion.button
                        type="button"
                        onClick={() => void handleLaunch(template, 0)}
                        disabled={launching}
                        className="planner-template-start"
                        whileTap={{ scale: 0.96 }}
                      >
                        <Play size={13} />
                        Start
                      </motion.button>
                      <button
                        type="button"
                        aria-label={`Edytuj szablon ${template.name}`}
                        onClick={() => navigate(`/templates/${template.id}/edit`)}
                        className="planner-icon-action"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Usuń szablon ${template.name}`}
                        onClick={() => setDeleteTarget(template)}
                        className="planner-icon-action planner-icon-action--danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="planner-template-footer">
                    <button
                      type="button"
                      onClick={() => setExpandedTemplateId((current) => current === template.id ? null : template.id)}
                      className="planner-secondary-action"
                    >
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {expanded ? 'Zwiń strukturę' : 'Pokaż strukturę'}
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        className="planner-day-board"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        {template.days.map((day, dayIndex) => (
                          <div
                            key={`${template.id}-${dayIndex}`}
                            className="planner-day-row"
                          >
                            <div className="planner-day-row-head">
                              <div>
                                <p>{day.name}</p>
                                <span>
                                  {day.exercises.length} {day.exercises.length === 1 ? 'ćwiczenie' : 'ćwiczeń'}
                                </span>
                              </div>

                              <motion.button
                                type="button"
                                onClick={() => void handleLaunch(template, dayIndex)}
                                disabled={launching}
                                className="planner-secondary-action"
                                whileTap={{ scale: 0.96 }}
                              >
                                <Play size={13} />
                                Start dnia
                              </motion.button>
                            </div>

                            <div className="planner-exercise-strip">
                              {day.exercises.slice(0, 5).map((exercise) => (
                                <span
                                  key={`${day.name}-${exercise.exerciseSource}-${exercise.exerciseId}`}
                                >
                                  {exercise.name}
                                </span>
                              ))}
                              {day.exercises.length > 5 && (
                                <span>
                                  +{day.exercises.length - 5}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              )
            })}
          </div>
        )}
      </AnimatePresence>

      {deleteTarget && (
        <ConfirmDialog
          message={`Usunąć szablon "${deleteTarget.name}"? Ta operacja jest nieodwracalna.`}
          confirmLabel="Usuń"
          cancelLabel="Anuluj"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}

      {launchTarget && (
        <ConfirmDialog
          message="Masz już rozpoczętą sesję w pamięci aplikacji. Start z szablonu nadpisze jej bieżący układ."
          confirmLabel="Uruchom szablon"
          cancelLabel="Zostań przy sesji"
          onConfirm={() => {
            void launchTemplate(launchTarget.template, launchTarget.dayIndex)
            setLaunchTarget(null)
          }}
          onCancel={() => setLaunchTarget(null)}
        />
      )}
    </>
  )
}
