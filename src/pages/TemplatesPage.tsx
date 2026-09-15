import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { pluralize } from '../lib/pluralize'

interface TemplateDeleteOperation {
  target: WorkoutTemplate
  status: 'pending' | 'error'
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
    let cancelled = false

    getTemplates(user.uid)
      .then((nextTemplates) => {
        if (cancelled) return
        setTemplates(nextTemplates)
        setError(false)
      })
      .catch(() => {
        if (cancelled) return
        toast.error('Could not load templates.')
        setError(true)
      })

      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadAttempt, user])

  function handleRetryLoad() {
    setError(false)
    setLoading(true)
    setLoadAttempt((value) => value + 1)
  }

  const shortPlanList = templates.length <= 2

  async function runTemplateDelete(target: WorkoutTemplate) {
    setDeleteOperation({ target, status: 'pending' })
    try {
      await deleteTemplate(target.id)
      setTemplates((prev) => prev.filter((template) => template.id !== target.id))
      setDeleteOperation(null)
      toast.success('Template deleted')
    } catch {
      setDeleteOperation({ target, status: 'error' })
      toast.error('Could not delete the plan.')
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
    return <LoadingState message="Loading templates..." />
  }

  return (
    <>
      <div className="workbench-page">
        <section className="planner-header plans-header">
        <div className="plans-header-title">
          <h1>Plans</h1>
          {templates.length > 0 && (
            <div className="planner-mini-stats" aria-label="Plan summary">
              <span>
                <strong>{templates.length}</strong>
                {' '}
                {pluralize(templates.length, 'plan', 'plans')}
              </span>
            </div>
          )}
        </div>

        <div className="planner-header-actions">
          <Link
            to="/exercises"
            className="planner-secondary-action plans-exercises-link mobile-touch-target"
          >
            Exercises
          </Link>

          <motion.button
            type="button"
            onClick={() => navigate('/templates/new')}
            className="planner-primary-action"
            whileTap={{ scale: 0.97 }}
          >
            <Plus size={16} />
            {!error && templates.length === 0 ? 'Create your first plan' : 'New plan'}
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
            <p className="text-lg font-semibold text-white">Could not load templates</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Check your connection and try again without reloading the page.
            </p>
            <Button type="button" className="mt-6 min-w-[12rem]" onClick={handleRetryLoad}>
              Try again
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
                <h2>You have no plans yet</h2>
                <p>
                  A plan stores your days, exercises and sets. Start any day with one click.
                </p>
              </div>
            </div>

            <div className="planner-empty-example">
              <div>
                <span>Example schedule</span>
                <strong>Upper / Lower · 4 days</strong>
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
              const showStructure = shortPlanList || expanded
              const structureId = `template-structure-${template.id}`
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
                        {template.days.length} {template.days.length === 1 ? 'day' : 'days'} · {totalExercises} {totalExercises === 1 ? 'exercise' : 'exercises'}
                      </p>
                    </div>

                    <div className="planner-template-actions">
                      <button
                        type="button"
                        aria-label={`Edit template ${template.name}`}
                        onClick={() => navigate(`/templates/${template.id}/edit`)}
                        className="planner-icon-action"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete template ${template.name}`}
                        onClick={() => requestTemplateDelete(template)}
                        disabled={deleteOperation !== null}
                        aria-describedby={templateDeleteOperation?.status === 'error' ? deleteFeedbackId : undefined}
                        className="planner-icon-action planner-icon-action--danger"
                      >
                        <Trash2 size={14} />
                      </button>
                      {!shortPlanList && (
                        <button
                          type="button"
                          onClick={() => setExpandedTemplateId((current) => current === template.id ? null : template.id)}
                          className="planner-secondary-action planner-structure-toggle"
                          aria-expanded={expanded}
                          aria-controls={structureId}
                        >
                          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {expanded ? 'Collapse' : 'Structure'}
                        </button>
                      )}
                    </div>
                  </div>

                  {templateLaunchOperation?.status === 'error' && (
                    <div className="planner-template-feedback">
                      <ActionFeedback
                        id={launchErrorId}
                        status="error"
                        message={templateLaunchOperation.errorMessage ?? 'Could not start the plan.'}
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
                          ? 'Deleting plan…'
                          : 'Could not delete the plan.'}
                        onRetry={templateDeleteOperation.status === 'error' ? retryTemplateDelete : undefined}
                        onDismiss={templateDeleteOperation.status === 'error'
                          ? () => setDeleteOperation(null)
                          : undefined}
                      />
                    </div>
                  )}

                  <AnimatePresence initial={false}>
                    {showStructure && (
                      <motion.div
                        id={structureId}
                        className="planner-day-board"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        {template.days.map((day, dayIndex) => {
                          const launchable = day.exercises.length > 0
                          const requestKey = `templates:${template.id}:detail:${dayIndex}`
                          return (
                          <motion.div
                            key={`${template.id}-${dayIndex}`}
                            data-testid={`template-day-detail-${template.id}-${dayIndex}`}
                            className="planner-day-row"
                          >
                            <span className="planner-day-row-head">
                              <span>
                                <strong className="planner-day-row-title">{day.name}</strong>
                                <small>
                                  {launchable
                                    ? `${day.exercises.length} ${day.exercises.length === 1 ? 'exercise' : 'exercises'}`
                                    : 'No exercises'}
                                </small>
                              </span>

                              {launchable ? (
                                <button
                                  type="button"
                                  aria-label={`Start day ${day.name} from template ${template.name}`}
                                  aria-describedby={feedbackDescription}
                                  aria-busy={isLaunchingControl(requestKey) || undefined}
                                  onClick={() => void requestTemplateLaunch(template, dayIndex, requestKey)}
                                  disabled={launchingTemplateId !== null}
                                  className="planner-day-start"
                                >
                                  {isLaunchingControl(requestKey) ? 'Starting…' : 'Start'}
                                  {!isLaunchingControl(requestKey) && <Play size={15} aria-hidden="true" />}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`Edit ${template.name} to add exercises to ${day.name}`}
                                  className="planner-day-edit"
                                  onClick={() => navigate(`/templates/${template.id}/edit`)}
                                >
                                  Edit plan
                                </button>
                              )}
                            </span>

                            {launchable && <span className="planner-exercise-strip">
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
                            </span>}
                          </motion.div>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              )
            })}
          </div>
        )}
        </AnimatePresence>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete template "${deleteTarget.name}"? Ta operacja jest nieodwracalna.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
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
