import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { getWorkout, deleteWorkout, calcVolume, type WorkoutSummary } from '../lib/workoutService'
import { exercises as exerciseDb } from '../data/exercises'

const CATEGORY_COLORS: Record<string, string> = {
  chest: '#4D8EFF', back: '#9B6DFF', legs: '#FF5757',
  arms: '#FF9F43', shoulders: '#FF6B9D', core: '#00D4AA', cardio: '#FFD700',
}
const exerciseMap = new Map(exerciseDb.map((e) => [e.id, e]))

function workoutAccent(w: WorkoutSummary): string {
  const ex = w.exercises[0]
  if (!ex?.exerciseId) return '#808CB3'
  return CATEGORY_COLORS[exerciseMap.get(ex.exerciseId)?.category ?? ''] ?? '#808CB3'
}

function workoutCategoryLabel(w: WorkoutSummary): string {
  const cats = [...new Set(
    w.exercises.map((e) => exerciseMap.get(e.exerciseId ?? '')?.category).filter(Boolean)
  )]
  if (cats.length === 0) return 'Trening'
  if (cats.length === 1) return cats[0]!
  return 'Trening'
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pl-PL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatDuration(start: number, end: number): string {
  const m = Math.round((end - start) / 60_000)
  if (m < 1) return '< 1 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [workout, setWorkout] = useState<WorkoutSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    getWorkout(id).then((w) => { setWorkout(w); setLoading(false) })
  }, [id])

  async function handleDelete() {
    if (!workout || !confirm('Usunąć ten trening? Tej operacji nie można cofnąć.')) return
    setDeleting(true)
    try {
      await deleteWorkout(workout.id)
      navigate('/dashboard')
    } catch {
      alert('Błąd usuwania. Sprawdź reguły Firestore (usuń warunek finishedAt == null).')
      setDeleting(false)
    }
  }

  if (loading) return null

  if (!workout) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Trening nie istnieje.</p>
          <button onClick={() => navigate('/dashboard')} style={{ color: 'var(--accent)' }}>
            Wróć
          </button>
        </div>
      </div>
    )
  }

  const accent = workoutAccent(workout)
  const volume = calcVolume(workout)
  const totalSets = workout.exercises.reduce((s, e) => s + e.sets.length, 0)

  return (
    <div className="min-h-screen max-w-lg mx-auto pb-10">

      {/* Header */}
      <motion.div
        className="flex items-center gap-3 px-5 pt-8 pb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 rounded-xl transition-opacity hover:opacity-70"
          style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <p className="text-sm font-semibold text-white">Szczegóły treningu</p>
      </motion.div>

      {/* Summary card */}
      <motion.div
        className="mx-5 mb-5 rounded-2xl overflow-hidden"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderLeft: `4px solid ${accent}`,
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.35 }}
      >
        <div className="p-5">
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: accent }}>
            {workoutCategoryLabel(workout)}
          </p>
          <h2 className="text-xl font-bold text-white mb-3">
            {formatDate(workout.startedAt)}
          </h2>
          <div className="flex gap-4">
            {[
              { label: 'Czas', value: formatDuration(workout.startedAt, workout.finishedAt) },
              { label: 'Serie', value: String(totalSets) },
              { label: 'Objętość', value: volume > 0 ? `${volume.toLocaleString('pl-PL')} kg` : '—' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Exercises */}
      <div className="px-5 flex flex-col gap-3">
        {workout.exercises.map((ex, ei) => {
          const exData = exerciseMap.get(ex.exerciseId ?? '')
          const exColor = CATEGORY_COLORS[exData?.category ?? ''] ?? '#808CB3'
          return (
            <motion.div
              key={ei}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + ei * 0.06, duration: 0.3 }}
            >
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{ex.name}</p>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: `${exColor}18`, color: exColor }}
                >
                  {exData?.equipment ?? ''}
                </span>
              </div>

              {/* Sets table */}
              <div className="px-4 pb-4">
                <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-2 mb-1">
                  {['#', 'kg', 'Powt.', 'Vol.'].map((h) => (
                    <span key={h} className="text-[10px] uppercase tracking-wide text-center" style={{ color: 'var(--muted)' }}>
                      {h}
                    </span>
                  ))}
                </div>
                {ex.sets.map((set, si) => (
                  <div
                    key={si}
                    className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-2 py-1.5 text-center"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <span className="text-xs font-bold" style={{ color: 'var(--teal)' }}>{si + 1}</span>
                    <span className="text-xs text-white">{set.weight}</span>
                    <span className="text-xs text-white">{set.reps}</span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {(set.weight * set.reps).toLocaleString('pl-PL')}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Delete */}
      <motion.div
        className="px-5 mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <motion.button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          style={{
            background: 'rgba(255,87,87,0.08)',
            border: '1px solid rgba(255,87,87,0.2)',
            color: '#FF5757',
          }}
          whileTap={{ scale: 0.97 }}
        >
          <Trash2 size={15} />
          {deleting ? 'Usuwanie...' : 'Usuń trening'}
        </motion.button>
      </motion.div>

    </div>
  )
}
