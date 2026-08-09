import { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { searchExercises, type Category, type Exercise } from '../data/exercises'
import type { ExerciseSource } from '../store/workoutStore'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { formatExerciseMeta } from '../lib/exerciseLabels'
import type { DataState } from '../types/dataState'
import { ActionFeedback } from './ActionFeedback'

const CATEGORIES: { value: Category | 'all'; label: string }[] = [
  { value: 'all',       label: 'Wszystkie' },
  { value: 'chest',     label: 'Klatka' },
  { value: 'back',      label: 'Plecy' },
  { value: 'legs',      label: 'Nogi' },
  { value: 'shoulders', label: 'Barki' },
  { value: 'arms',      label: 'Ramiona' },
  { value: 'core',      label: 'Core' },
  { value: 'cardio',    label: 'Cardio' },
]

type SearchResult = Exercise & { source: ExerciseSource }

interface Props {
  onSelect: (exerciseId: string, name: string, source: ExerciseSource) => void
  onClose: () => void
  userExercisesState: DataState<Exercise[]>
  onRetryUserExercises: () => void
}

export default function ExercisePicker({
  onSelect,
  onClose,
  userExercisesState,
  onRetryUserExercises,
}: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const globalResults: SearchResult[] = searchExercises(query, category === 'all' ? undefined : category)
    .map((ex) => ({ ...ex, source: 'global' as const }))

  const userExercises = userExercisesState.status === 'success'
    ? userExercisesState.data
    : []
  const q = query.toLowerCase()
  const userResults: SearchResult[] = userExercises
    .filter((ex) => {
      const matchesQuery = !q || ex.name.toLowerCase().includes(q)
      const matchesCategory = category === 'all' || ex.category === category
      return matchesQuery && matchesCategory
    })
    .map((ex) => ({ ...ex, source: 'user' as const }))

  const results = [...userResults, ...globalResults]

  useDialogA11y({
    containerRef: dialogRef,
    onClose,
    initialFocusRef: searchInputRef,
  })

  return (
    <div
      className="fixed inset-0 z-50 px-0 py-0 sm:px-6 sm:py-6"
      style={{ background: 'rgba(6, 10, 18, 0.74)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="surface-panel flex h-[100dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-xl)] sm:mx-auto sm:h-[min(42rem,calc(100dvh-3rem))] sm:max-w-3xl sm:rounded-[var(--radius-xl)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-5 sm:pt-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="mobile-touch-target flex h-8 w-8 flex-none items-center justify-center rounded-[var(--radius-md)] transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
            aria-label="Zamknij wybór ćwiczenia"
          >
            <X size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p id={titleId} className="mb-1 text-sm font-semibold text-white">
              Wybierz ćwiczenie
            </p>
          <input
            ref={searchInputRef}
            autoFocus
            type="text"
            placeholder="Szukaj ćwiczenia..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Szukaj ćwiczenia"
            className="flex-1 bg-transparent text-sm text-white outline-none"
            style={{ color: 'var(--text)' }}
          />
          </div>
        </div>

        {/* Category filter */}
        <div
          className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:px-5"
          style={{ borderBottom: '1px solid var(--border)' }}
          role="group"
          aria-label="Kategoria ćwiczenia"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className="mobile-touch-target px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
              style={{
                background: category === c.value ? 'var(--accent-soft)' : 'var(--card)',
                color: category === c.value ? 'var(--text-strong)' : 'var(--muted)',
                border: `1px solid ${category === c.value ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div
          className="flex-1 overflow-y-auto px-2 py-2 sm:px-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {userExercisesState.status === 'loading' && (
            <ActionFeedback
              status="pending"
              message="Wczytywanie Twoich ćwiczeń…"
              className="mx-2 mb-2 sm:mx-1"
            />
          )}
          {userExercisesState.status === 'error' && (
            <ActionFeedback
              status="error"
              message="Nie udało się wczytać Twoich ćwiczeń. Katalog globalny nadal jest dostępny."
              onRetry={onRetryUserExercises}
              className="mx-2 mb-2 sm:mx-1"
            />
          )}
          {userExercisesState.status === 'success' && results.length === 0 ? (
            <p className="px-4 py-10 text-sm text-center" style={{ color: 'var(--muted)' }}>
              Brak wyników
            </p>
          ) : results.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {results.map((ex) => (
                <button
                  key={`${ex.source}-${ex.id}`}
                  onClick={() => onSelect(ex.id, ex.name, ex.source)}
                  className="w-full rounded-[1.25rem] px-4 py-4 text-left transition-transform hover:-translate-y-0.5"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${ex.source === 'user' ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{ex.name}</p>
                    {ex.source === 'user' && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        moje
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    {formatExerciseMeta(ex.equipment, ex.muscles)}
                  </p>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
