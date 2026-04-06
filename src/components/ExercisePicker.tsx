import { useState } from 'react'
import { searchExercises, type Category } from '../data/exercises'

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

interface Props {
  onSelect: (exerciseId: string, name: string) => void
  onClose: () => void
}

export default function ExercisePicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')

  const results = searchExercises(query, category === 'all' ? undefined : category)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={onClose}
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--muted)' }}
        >
          ✕
        </button>
        <input
          autoFocus
          type="text"
          placeholder="Szukaj ćwiczenia..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm text-white outline-none"
          style={{ color: 'var(--text)' }}
        />
      </div>

      {/* Category filter */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
            style={{
              background: category === c.value ? 'var(--accent)' : 'var(--card)',
              color: category === c.value ? '#08061A' : 'var(--muted)',
              border: `1px solid ${category === c.value ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--muted)' }}>
            Brak wyników
          </p>
        ) : (
          results.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onSelect(ex.id, ex.name)}
              className="w-full px-4 py-3.5 text-left transition-opacity hover:opacity-80"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <p className="text-sm font-medium text-white">{ex.name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {ex.equipment} · {ex.muscles.join(', ')}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
