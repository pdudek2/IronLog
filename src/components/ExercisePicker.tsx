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
      className="fixed inset-0 z-50 px-0 py-0 sm:px-6 sm:py-6"
      style={{ background: 'rgba(5, 6, 20, 0.74)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        className="surface-panel flex h-[100dvh] w-full flex-col overflow-hidden rounded-t-[2rem] sm:mx-auto sm:h-[min(42rem,calc(100dvh-3rem))] sm:max-w-3xl sm:rounded-[2rem]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-5 sm:pt-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
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
        <div
          className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:px-5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
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
        <div
          className="flex-1 overflow-y-auto px-2 py-2 sm:px-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {results.length === 0 ? (
            <p className="px-4 py-10 text-sm text-center" style={{ color: 'var(--muted)' }}>
              Brak wyników
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {results.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => onSelect(ex.id, ex.name)}
                  className="w-full rounded-[1.25rem] px-4 py-4 text-left transition-transform hover:-translate-y-0.5"
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <p className="text-sm font-medium text-white">{ex.name}</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    {ex.equipment} · {ex.muscles.join(', ')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
