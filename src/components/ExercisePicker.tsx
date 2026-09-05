import { useId, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
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
      className="exercise-picker-overlay fixed inset-0 z-50 px-0 py-0 sm:px-6 sm:py-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="exercise-picker-dialog flex h-[100dvh] w-full flex-col overflow-hidden sm:mx-auto sm:h-[min(44rem,calc(100dvh-3rem))] sm:max-w-3xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="exercise-picker-head">
          <div className="exercise-picker-title-row">
            <div>
              <p id={titleId}>Wybierz ćwiczenie</p>
              <span>{results.length} wyników</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="exercise-picker-close mobile-touch-target"
              aria-label="Zamknij wybór ćwiczenia"
            >
              <X size={17} />
            </button>
          </div>

          <label className="exercise-picker-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Szukaj ćwiczenia..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Szukaj ćwiczenia"
            />
          </label>
        </div>

        <div
          className="exercise-picker-categories no-scrollbar"
          role="group"
          aria-label="Kategoria ćwiczenia"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className="exercise-picker-category mobile-touch-target"
            >
              {c.label}
            </button>
          ))}
        </div>

        <div
          className="exercise-picker-scroll flex-1 overflow-y-auto"
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
            <div className="exercise-picker-empty">
              <strong>Brak wyników</strong>
              <p>Zmień wyszukiwanie albo wybierz inną kategorię.</p>
            </div>
          ) : results.length > 0 ? (
            <div className="exercise-picker-results">
              {results.map((ex) => (
                <button
                  key={`${ex.source}-${ex.id}`}
                  onClick={() => onSelect(ex.id, ex.name, ex.source)}
                  className="exercise-picker-result w-full text-left"
                  data-source={ex.source}
                >
                  <div className="exercise-picker-result-main">
                    <p>{ex.name}</p>
                    {ex.source === 'user' && (
                      <span>
                        moje
                      </span>
                    )}
                  </div>
                  <p className="exercise-picker-result-meta">
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
