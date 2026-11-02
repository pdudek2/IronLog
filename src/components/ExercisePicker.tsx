import { useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Search } from 'lucide-react'
import { exercises as exerciseDb, searchExercises, type Category, type Exercise } from '../data/exercises'
import type { ExerciseSource } from '../store/workoutStore'
import { EXERCISE_CATEGORY_LABELS, getEquipmentLabel } from '../lib/exerciseLabels'
import type { RecentExercisePick } from '../shared/recentExercises'
import type { DataState } from '../types/dataState'
import { ActionFeedback } from './ActionFeedback'
import BottomSheet from './BottomSheet'

const CATEGORIES: { value: Category | 'all'; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'chest',     label: 'Chest' },
  { value: 'back',      label: 'Back' },
  { value: 'legs',      label: 'Legs' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'arms',      label: 'Arms' },
  { value: 'core',      label: 'Core' },
  { value: 'cardio',    label: 'Cardio' },
]

type SearchResult = Exercise & { source: ExerciseSource }

interface Props {
  open: boolean
  onSelect: (exerciseId: string, name: string, source: ExerciseSource) => void
  onClose: () => void
  userExercisesState: DataState<Exercise[]>
  onRetryUserExercises: () => void
  recent?: RecentExercisePick[]
}

function ResultRow({ exercise, onSelect }: { exercise: SearchResult; onSelect: Props['onSelect'] }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(exercise.id, exercise.name, exercise.source)}
      className="exercise-picker-result"
      data-source={exercise.source}
    >
      <span>{exercise.name}</span>
      {exercise.source === 'user' && <em>mine</em>}
      <small>{[EXERCISE_CATEGORY_LABELS[exercise.category], getEquipmentLabel(exercise.equipment)].filter(Boolean).join(' · ')}</small>
    </button>
  )
}

function PickerBody({ onSelect, onClose, userExercisesState, onRetryUserExercises, recent = [] }: Omit<Props, 'open'>) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const searchInputRef = useRef<HTMLInputElement>(null)
  // On a phone the keyboard would cover the list before anything is chosen.
  const touch = window.matchMedia?.('(hover: none)').matches

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
  const filtered = q !== '' || category !== 'all'
  const recentResults: SearchResult[] = filtered ? [] : recent.flatMap((pick) => {
    const exercise = (pick.source === 'user' ? userExercises : exerciseDb).find(({ id }) => id === pick.id)
    return exercise ? [{ ...exercise, name: pick.name, source: pick.source }] : []
  })

  return (
    <BottomSheet title="Add exercise" tall onClose={onClose} initialFocusRef={touch ? undefined : searchInputRef}>
      <label className="exercise-picker-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search exercises"
        />
      </label>

      <div className="exercise-picker-categories no-scrollbar" role="group" aria-label="Exercise category">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            aria-pressed={category === c.value}
            className="exercise-picker-category"
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="exercise-picker-scroll">
        {userExercisesState.status === 'loading' && (
          <ActionFeedback status="pending" message="Loading your exercises…" />
        )}
        {userExercisesState.status === 'error' && (
          <ActionFeedback
            status="error"
            message="Could not load your exercises. The shared library is still available."
            onRetry={onRetryUserExercises}
          />
        )}
        {recentResults.length > 0 && (
          <>
            <p className="exercise-picker-group">Recently used</p>
            {recentResults.map((exercise) => (
              <ResultRow key={`recent-${exercise.source}-${exercise.id}`} exercise={exercise} onSelect={onSelect} />
            ))}
          </>
        )}
        {results.length > 0 ? (
          <>
            <p className="exercise-picker-group">{filtered ? `${results.length} found` : 'All exercises'}</p>
            {results.map((exercise) => (
              <ResultRow key={`${exercise.source}-${exercise.id}`} exercise={exercise} onSelect={onSelect} />
            ))}
          </>
        ) : userExercisesState.status === 'success' ? (
          <div className="exercise-picker-empty">
            <strong>No results</strong>
            <p>Change your search or choose another category.</p>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  )
}

export default function ExercisePicker({ open, ...props }: Props) {
  return <AnimatePresence>{open && <PickerBody key="exercise-picker" {...props} />}</AnimatePresence>
}
