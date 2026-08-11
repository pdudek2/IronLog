import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '../components/ConfirmDialog'
import TemplateLaunchConfirmDialog from '../components/TemplateLaunchConfirmDialog'
import { ActionFeedback } from '../components/ActionFeedback'
import { Button, LoadingState } from '../components/ui'
import { useTemplateWorkoutLaunch } from '../hooks/useTemplateWorkoutLaunch'
import { useAuthStore } from '../store/authStore'
import {
  deleteTemplate,
  getTemplates,
  type WorkoutTemplate,
} from '../lib/templateService'
import { polishPlural } from '../lib/polishPlural'

interface TemplateDeleteOperation {
  target: WorkoutTemplate
  status: 'pending' | 'error'
}

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
  const navigate = useNavigate()
  const {
    pendingLaunch,
    launchOperation,
    launchingTemplateId,
    requestTemplateLaunch,
    confirmTemplateLaunch,
    cancelTemplateLaunch,
    retryTemplateLaunch,
    dismissTemplateLaunchError,
  } = useTemplateWorkoutLaunch(user?.uid)

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<WorkoutTemplate | null>(null)
  const [deleteOperation, setDeleteOperation] = useState<TemplateDeleteOperation | null>(null)
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

  const plannerStats = useMemo(() => ({
    templates: templates.length,
    days: templates.reduce((sum, template) => sum + template.days.length, 0),
    exercises: templates.reduce((sum, template) => sum + countTemplateExercises(template), 0),
  }), [templates])

  async function runTemplateDelete(target: WorkoutTemplate) {
    setDeleteOperation({ target, status: 'pending' })
    try {
      await deleteTemplate(target.id)
      setTemplates((prev) => prev.filter((template) => template.id !== target.id))
      setDeleteOperation(null)
      toast.success('Szablon usunięty')
    } catch {
      setDeleteOperation({ target, status: 'error' })
      toast.error('Nie udało się usunąć planu.')
    }
  }

  function handleDeleteConfirmed() {
    if (!deleteTarget || deleteOperation) return
    const target = deleteTarget
    setDeleteTarget(null)
    void runTemplateDelete(target)
  }

  function requestTemplateDelete(target: WorkoutTemplate) {
    if (deleteOperation) return
    setDeleteTarget(target)
  }

  function retryTemplateDelete() {
    if (!deleteOperation || deleteOperation.status !== 'error') return
    void runTemplateDelete(deleteOperation.target)
  }

  if (loading) {
    return <LoadingState message="Ładowanie szablonów..." />
  }

  return (
    <>
      <section className="planner-header">
        <div>
          <h1>Plany</h1>
        </div>

        <div className="planner-header-actions">
          {templates.length > 0 && (
            <div className="planner-mini-stats" aria-label="Podsumowanie planów">
              <span>
                <strong>{plannerStats.templates}</strong>
                {' '}
                {polishPlural(plannerStats.templates, 'plan', 'plany', 'planów')}
              </span>
              <span>
                <strong>{plannerStats.days}</strong>
                {' '}
                {polishPlural(plannerStats.days, 'dzień', 'dni', 'dni')}
              </span>
              <span>
                <strong>{plannerStats.exercises}</strong>
                ćw.
              </span>
            </div>
          )}

          <motion.button
            type="button"
            onClick={() => navigate('/templates/new')}
            className="planner-primary-action"
            whileTap={{ scale: 0.97 }}
          >
            <Plus size={16} />
            {!error && templates.length === 0 ? 'Utwórz pierwszy plan' : 'Nowy plan'}
          </motion.button>
        </div>
      </section>

      <AnimatePresence mode="popLayout">
        {error ? (
          <motion.div
            className="planner-status"
            role="alert"
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
          <motion.section
            className="planner-empty-state"
            initial={false}
            animate={{ opacity: 1 }}
          >
            <div className="planner-empty-copy">
              <div>
                <h2>Nie masz jeszcze planu</h2>
                <p>
                  Plan zapisuje dni, ćwiczenia i serie. Potem uruchamiasz wybrany dzień jednym kliknięciem.
                </p>
              </div>
            </div>

            <div className="planner-empty-example">
              <div>
                <span>Przykładowy układ</span>
                <strong>Upper / Lower · 4 dni</strong>
              </div>
              <ol>
                {[
                  ['Upper A', 'Bench Press · Row · OHP'],
                  ['Lower A', 'Squat · RDL · Leg Press'],
                  ['Upper B', 'Incline · Pull-up · Lateral Raise'],
                  ['Lower B', 'Deadlift · Split Squat · Leg Curl'],
                ].map(([day, exercises]) => (
                  <li key={day}>
                    <strong>{day}</strong>
                    <span>{exercises}</span>
                  </li>
                ))}
              </ol>
            </div>
          </motion.section>
        ) : (
          <div className="template-board planner-template-board">
            {templates.map((template, index) => {
              const totalExercises = countTemplateExercises(template)
              const expanded = expandedTemplateId === template.id
              const templateLaunchOperation = launchOperation?.target.template.id === template.id
                ? launchOperation
                : null
              const isTemplateLaunching = templateLaunchOperation?.status === 'pending'
              const launchErrorId = `template-launch-error-${template.id}`
              const templateDeleteOperation = deleteOperation?.target.id === template.id
                ? deleteOperation
                : null
              const isTemplateDeleting = templateDeleteOperation?.status === 'pending'
              const deleteFeedbackId = `template-delete-feedback-${template.id}`
              const feedbackDescription = [
                templateLaunchOperation?.status === 'error' ? launchErrorId : null,
                templateDeleteOperation?.status === 'error' ? deleteFeedbackId : null,
              ].filter(Boolean).join(' ') || undefined
              const isLaunchingControl = (requestKey: string) => (
                isTemplateLaunching
                && templateLaunchOperation.target.requestKey === requestKey
              )
              return (
                <motion.article
                  key={template.id}
                  className="template-card planner-template-row"
                  aria-busy={isTemplateLaunching || isTemplateDeleting ? 'true' : undefined}
                  aria-describedby={feedbackDescription}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.2 }}
                >
                  <div className="planner-template-main">
                    <div className="planner-template-title">
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
                          data-testid={`template-day-summary-${template.id}-${dayIndex}`}
                          aria-label={`Uruchom dzień ${day.name} z szablonu ${template.name}`}
                          aria-describedby={feedbackDescription}
                          onClick={() => void requestTemplateLaunch(
                            template,
                            dayIndex,
                            `templates:${template.id}:summary:${dayIndex}`,
                          )}
                          disabled={launchingTemplateId !== null}
                        >
                          {isLaunchingControl(`templates:${template.id}:summary:${dayIndex}`) ? (
                            <span>Uruchamiam…</span>
                          ) : (
                            <>
                              <span>{day.name}</span>
                              <small>{day.exercises.length} ćw.</small>
                            </>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="planner-template-actions">
                      <motion.button
                        type="button"
                        aria-label={`Uruchom szablon ${template.name}`}
                        aria-describedby={feedbackDescription}
                        onClick={() => void requestTemplateLaunch(
                          template,
                          0,
                          `templates:${template.id}:primary`,
                        )}
                        disabled={launchingTemplateId !== null}
                        className="planner-template-start"
                        whileTap={{ scale: 0.96 }}
                      >
                        {!isLaunchingControl(`templates:${template.id}:primary`) && <Play size={13} />}
                        {isLaunchingControl(`templates:${template.id}:primary`) ? 'Uruchamiam…' : 'Start'}
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
                        onClick={() => requestTemplateDelete(template)}
                        disabled={deleteOperation !== null}
                        aria-describedby={templateDeleteOperation?.status === 'error' ? deleteFeedbackId : undefined}
                        className="planner-icon-action planner-icon-action--danger"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedTemplateId((current) => current === template.id ? null : template.id)}
                        className="planner-secondary-action planner-structure-toggle"
                        aria-expanded={expanded}
                      >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expanded ? 'Zwiń' : 'Struktura'}
                      </button>
                    </div>
                  </div>

                  {templateLaunchOperation?.status === 'error' && (
                    <div className="planner-template-feedback">
                      <ActionFeedback
                        id={launchErrorId}
                        status="error"
                        message={templateLaunchOperation.errorMessage ?? 'Nie udało się uruchomić planu.'}
                        onRetry={() => { void retryTemplateLaunch() }}
                        onDismiss={dismissTemplateLaunchError}
                      />
                    </div>
                  )}

                  {templateDeleteOperation && (
                    <div className="planner-template-feedback">
                      <ActionFeedback
                        id={deleteFeedbackId}
                        status={templateDeleteOperation.status}
                        message={templateDeleteOperation.status === 'pending'
                          ? 'Usuwanie planu…'
                          : 'Nie udało się usunąć planu.'}
                        onRetry={templateDeleteOperation.status === 'error' ? retryTemplateDelete : undefined}
                        onDismiss={templateDeleteOperation.status === 'error'
                          ? () => setDeleteOperation(null)
                          : undefined}
                      />
                    </div>
                  )}

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
                                data-testid={`template-day-detail-${template.id}-${dayIndex}`}
                                aria-label={`Uruchom dzień ${day.name} z szablonu ${template.name}`}
                                aria-describedby={feedbackDescription}
                                onClick={() => void requestTemplateLaunch(
                                  template,
                                  dayIndex,
                                  `templates:${template.id}:detail:${dayIndex}`,
                                )}
                                disabled={launchingTemplateId !== null}
                                className="planner-secondary-action"
                                whileTap={{ scale: 0.96 }}
                              >
                                {!isLaunchingControl(`templates:${template.id}:detail:${dayIndex}`) && <Play size={13} />}
                                {isLaunchingControl(`templates:${template.id}:detail:${dayIndex}`)
                                  ? 'Uruchamiam…'
                                  : 'Start dnia'}
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

      <TemplateLaunchConfirmDialog
        open={pendingLaunch !== null}
        onConfirm={() => { void confirmTemplateLaunch() }}
        onCancel={cancelTemplateLaunch}
      />
    </>
  )
}
