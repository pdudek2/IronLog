import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, ChevronDown, ChevronUp, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import { LoadingState } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { useWorkoutStore } from '../store/workoutStore'
import { fetchRemoteSessionHasWork, saveActiveSession } from '../lib/activeSessionService'
import {
  buildActiveWorkoutFromTemplate,
  deleteTemplate,
  getTemplates,
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
  const [launching, setLaunching] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<WorkoutTemplate | null>(null)
  const [launchTarget, setLaunchTarget] = useState<{ template: WorkoutTemplate; dayIndex: number } | null>(null)
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getTemplates(user.uid)
      .then(setTemplates)
      .catch(() => {
        toast.error('Nie udało się pobrać szablonów.')
        setError(true)
      })
      .finally(() => setLoading(false))
  }, [user])

  const hasActiveWork = useMemo(() => {
    if (!active) return false
    if (active.exercises.length > 0) return true
    return Boolean(active.label?.trim())
  }, [active])

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

    const nextWorkout = buildActiveWorkoutFromTemplate(template, dayIndex)
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

  if (loading) {
    return <LoadingState message="Ładowanie szablonów..." />
  }

  return (
    <AppShell current="templates">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>
            Planowanie
          </p>
          <h1 className="page-title">Szablony treningów</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Zapisz rozpiski na dni tygodnia, uruchamiaj je jednym kliknięciem i utrzymuj powtarzalny rytm pracy.
          </p>
        </div>

        <motion.button
          onClick={() => navigate('/templates/new')}
          className="hidden items-center gap-2 rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold lg:inline-flex"
          style={{
            background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
            color: 'var(--accent-foreground)',
            boxShadow: '0 14px 32px rgba(90,166,255,0.22)',
          }}
          whileTap={{ scale: 0.97 }}
        >
          <Plus size={16} />
          Nowy szablon
        </motion.button>
      </div>

      <div className="mb-5 flex lg:hidden">
        <motion.button
          onClick={() => navigate('/templates/new')}
          className="inline-flex items-center gap-2 rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold"
          style={{
            background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
            color: 'var(--accent-foreground)',
          }}
          whileTap={{ scale: 0.97 }}
        >
          <Plus size={16} />
          Nowy szablon
        </motion.button>
      </div>

      <AnimatePresence mode="popLayout">
        {error ? (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-10 text-center"
            initial={false}
            animate={{ opacity: 1 }}
          >
            <p className="text-lg font-semibold text-white">Nie udało się pobrać szablonów</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Sprawdź połączenie i odśwież stronę.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 rounded-[var(--radius-lg)] px-5 py-3 text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'white' }}
            >
              Odśwież
            </button>
          </motion.div>
        ) : templates.length === 0 ? (
          <motion.div
            className="surface-panel rounded-[var(--radius-xl)] p-10 text-center"
            initial={false}
            animate={{ opacity: 1 }}
          >
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)]"
              style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }}
            >
              <CalendarDays size={24} />
            </div>
            <p className="text-lg font-semibold text-white">Brak zapisanych planów</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Pierwszy szablon skróci wejście w sesję i pozwoli odpalać gotową rozpiskę bez ręcznego dodawania każdego ćwiczenia.
            </p>
            <motion.button
              onClick={() => navigate('/templates/new')}
              className="mt-6 rounded-[var(--radius-lg)] px-5 py-3 text-sm font-semibold"
              style={{
                background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
                color: 'var(--accent-foreground)',
              }}
              whileTap={{ scale: 0.97 }}
            >
              Utwórz pierwszy szablon
            </motion.button>
          </motion.div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {templates.map((template, index) => {
              const totalExercises = countTemplateExercises(template)
              const expanded = expandedTemplateId === template.id
              return (
                <motion.div
                  key={template.id}
                  className="surface-panel rounded-[var(--radius-xl)] p-5"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.2 }}
                  whileHover={{ y: -2, boxShadow: '0 18px 52px rgba(2,8,20,0.55), inset 0 0 0 1px rgba(90,166,255,0.2)' }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="eyebrow">Szablon</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">
                        {template.name}
                      </h2>
                      <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                        {template.days.length} {template.days.length === 1 ? 'dzień' : 'dni'} • {totalExercises} {totalExercises === 1 ? 'ćwiczenie' : 'ćwiczeń'} • aktualizacja {formatDate(template.updatedAt)}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {template.days.map((day, dayIndex) => (
                          <span
                            key={`${template.id}-summary-${dayIndex}`}
                            className="rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-medium"
                            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--muted)' }}
                          >
                            {day.name} • {day.exercises.length}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        aria-label={`Edytuj szablon ${template.name}`}
                        onClick={() => navigate(`/templates/${template.id}/edit`)}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'white' }}
                      >
                        <Pencil size={13} />
                        Edytuj
                      </button>
                      <button
                        aria-label={`Usuń szablon ${template.name}`}
                        onClick={() => setDeleteTarget(template)}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold"
                        style={{ background: 'rgba(255,87,87,0.08)', border: '1px solid rgba(255,87,87,0.18)', color: '#FF5757' }}
                      >
                        <Trash2 size={13} />
                        Usuń
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedTemplateId((current) => current === template.id ? null : template.id)}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'white' }}
                    >
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {expanded ? 'Zwiń dni planu' : 'Pokaż dni planu'}
                    </button>

                    <motion.button
                      onClick={() => void handleLaunch(template, 0)}
                      disabled={launching}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      style={{
                        background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
                        color: 'var(--accent-foreground)',
                      }}
                      whileTap={{ scale: 0.96 }}
                    >
                      <Play size={13} />
                      Start od dnia 1
                    </motion.button>
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        className="mt-4 space-y-3"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        {template.days.map((day, dayIndex) => (
                          <div
                            key={`${template.id}-${dayIndex}`}
                            className="rounded-[var(--radius-lg)] border p-4"
                            style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white">{day.name}</p>
                                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                                  {day.exercises.length} {day.exercises.length === 1 ? 'ćwiczenie' : 'ćwiczeń'}
                                </p>
                              </div>

                              <motion.button
                                onClick={() => void handleLaunch(template, dayIndex)}
                                disabled={launching}
                                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                                style={{
                                  background: 'rgba(255,255,255,0.04)',
                                  border: '1px solid var(--border)',
                                  color: 'white',
                                }}
                                whileTap={{ scale: 0.96 }}
                              >
                                <Play size={13} />
                                Rozpocznij ten dzień
                              </motion.button>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {day.exercises.slice(0, 5).map((exercise) => (
                                <span
                                  key={`${day.name}-${exercise.exerciseSource}-${exercise.exerciseId}`}
                                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                                >
                                  {exercise.name}
                                </span>
                              ))}
                              {day.exercises.length > 5 && (
                                <span
                                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                                >
                                  +{day.exercises.length - 5}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
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
    </AppShell>
  )
}
