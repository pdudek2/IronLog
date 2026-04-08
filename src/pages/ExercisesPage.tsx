import React, { useEffect, useId, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Dumbbell, Plus, Search } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { exercises, type Category, type Equipment, type Exercise, type MuscleGroup } from '../data/exercises'
import { createUserExercise, getUserExercises, type UserExerciseInput } from '../lib/userExercisesService'
import { useDialogA11y } from '../hooks/useDialogA11y'

// ─── Labels ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<Category | 'all', string> = {
  all: 'Wszystkie',
  chest: 'Klatka',
  back: 'Plecy',
  legs: 'Nogi',
  shoulders: 'Barki',
  arms: 'Ramiona',
  core: 'Core',
  cardio: 'Cardio',
}

const EQUIPMENT_LABELS: Record<Equipment | 'all', string> = {
  all: 'Wszystkie',
  barbell: 'Sztanga',
  dumbbell: 'Hantle',
  cable: 'Kabel',
  machine: 'Maszyna',
  bodyweight: 'Własne ciało',
  kettlebell: 'Kettlebell',
}

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Klatka',
  back: 'Plecy',
  quads: 'Quady',
  hamstrings: 'Dwugłowe',
  glutes: 'Pośladki',
  shoulders: 'Barki',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Przedramiona',
  core: 'Core',
  calves: 'Łydki',
}

const CATEGORIES = (Object.keys(CATEGORY_LABELS) as (Category | 'all')[])
const EQUIPMENT_OPTIONS = (Object.keys(EQUIPMENT_LABELS) as (Equipment | 'all')[])
const MUSCLE_OPTIONS = (Object.keys(MUSCLE_LABELS) as MuscleGroup[])

// ─── Create Form Modal ────────────────────────────────────────────────────────

interface CreateFormProps {
  onSubmit: (input: UserExerciseInput) => Promise<void>
  onClose: () => void
}

function CreateExerciseForm({ onSubmit, onClose }: CreateFormProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('chest')
  const [equipment, setEquipment] = useState<Equipment>('barbell')
  const [muscles, setMuscles] = useState<MuscleGroup[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dialogRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  useDialogA11y({ containerRef: dialogRef, onClose, initialFocusRef: nameInputRef })

  function toggleMuscle(m: MuscleGroup) {
    setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Nazwa musi mieć co najmniej 2 znaki.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit({ name: trimmed, category, equipment, muscles })
    } catch {
      setError('Błąd zapisu. Spróbuj ponownie.')
      setSaving(false)
    }
  }

  const selectStyle = {
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '0.75rem',
    padding: '0.5rem 0.75rem',
    width: '100%',
    fontSize: '0.875rem',
    appearance: 'none' as const,
  }

  return (
    <div
      className="fixed inset-0 z-50 px-0 py-0 sm:px-6 sm:py-6"
      style={{ background: 'rgba(5,6,20,0.74)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="surface-panel flex flex-col overflow-hidden rounded-t-[2rem] sm:mx-auto sm:rounded-[2rem] sm:max-w-lg"
        style={{ maxHeight: '90dvh', marginTop: 'auto' }}
        onClick={(e) => e.stopPropagation()}
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
            aria-label="Zamknij formularz"
          >
            ✕
          </button>
          <p id={titleId} className="text-sm font-semibold text-white">
            Dodaj własne ćwiczenie
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Nazwa *
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Banded Pull-apart"
              maxLength={60}
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                borderRadius: '0.75rem',
                padding: '0.5rem 0.75rem',
                width: '100%',
                fontSize: '0.875rem',
              }}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Kategoria
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} style={selectStyle}>
              {(Object.keys(CATEGORY_LABELS) as (Category | 'all')[])
                .filter((c) => c !== 'all')
                .map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
            </select>
          </div>

          {/* Equipment */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Sprzęt
            </label>
            <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)} style={selectStyle}>
              {(Object.keys(EQUIPMENT_LABELS) as (Equipment | 'all')[])
                .filter((eq) => eq !== 'all')
                .map((eq) => (
                  <option key={eq} value={eq}>{EQUIPMENT_LABELS[eq]}</option>
                ))}
            </select>
          </div>

          {/* Muscles */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Partie mięśniowe
            </label>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_OPTIONS.map((m) => {
                const active = muscles.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMuscle(m)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--card)',
                      color: active ? '#08061A' : 'var(--muted)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {MUSCLE_LABELS[m]}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs" style={{ color: '#FF4B4B' }}>{error}</p>
          )}

          <motion.button
            type="submit"
            disabled={saving}
            className="w-full rounded-[1.4rem] py-3.5 text-sm font-semibold tracking-wide disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#08061A' }}
            whileTap={{ scale: 0.97 }}
          >
            {saving ? 'Zapisuję...' : 'Dodaj ćwiczenie'}
          </motion.button>
        </form>
      </div>
    </div>
  )
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

interface CardProps {
  exercise: Exercise
  isUser: boolean
}

function ExerciseCard({ exercise, isUser }: CardProps) {
  const muscleText = exercise.muscles.map((m) => MUSCLE_LABELS[m]).join(', ')
  return (
    <div
      className="rounded-[1.25rem] px-4 py-4"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${isUser ? 'rgba(232,255,87,0.25)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-medium text-white leading-snug">{exercise.name}</p>
        {isUser && (
          <span
            className="flex-none text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(232,255,87,0.15)', color: 'var(--accent)' }}
          >
            moje
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        {EQUIPMENT_LABELS[exercise.equipment]}
        {muscleText ? ` · ${muscleText}` : ''}
      </p>
    </div>
  )
}

// ─── Filter Chips (horizontal scroll row) ────────────────────────────────────

interface ChipRowProps<T extends string> {
  options: T[]
  labels: Record<T, string>
  active: T
  onSelect: (v: T) => void
}

function ChipRow<T extends string>({ options, labels, active, onSelect }: ChipRowProps<T>) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onSelect(opt)}
          className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
          style={{
            background: active === opt ? 'var(--accent)' : 'var(--card)',
            color: active === opt ? '#08061A' : 'var(--muted)',
            border: `1px solid ${active === opt ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  )
}

// ─── Sidebar Filter Group ─────────────────────────────────────────────────────

interface SidebarFilterProps<T extends string> {
  title: string
  options: T[]
  labels: Record<T, string>
  active: T
  onSelect: (v: T) => void
}

function SidebarFilter<T extends string>({ title, options, labels, active, onSelect }: SidebarFilterProps<T>) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>{title}</p>
      <div className="flex flex-col gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className="text-left px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: active === opt ? 'rgba(232,255,87,0.12)' : 'transparent',
              color: active === opt ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {labels[opt]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--muted)' }}>{title}</p>
      <span className="text-[10px]" style={{ color: 'var(--muted)' }}>({count})</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const { user } = useAuthStore()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const [userExercises, setUserExercises] = useState<Exercise[]>([])
  const [loadingUser, setLoadingUser] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!user) return
    getUserExercises(user.uid)
      .then(setUserExercises)
      .catch(() => {})
      .finally(() => setLoadingUser(false))
  }, [user])

  const q = query.toLowerCase()

  function matchesFilters(ex: Exercise) {
    return (
      (!q || ex.name.toLowerCase().includes(q)) &&
      (category === 'all' || ex.category === category) &&
      (equipment === 'all' || ex.equipment === equipment)
    )
  }

  const filteredUser = userExercises.filter(matchesFilters)
  const filteredGlobal = exercises.filter(matchesFilters)

  async function handleCreate(input: UserExerciseInput) {
    if (!user) return
    const created = await createUserExercise(user.uid, input)
    setUserExercises((prev) => [created, ...prev])
    setShowForm(false)
    toast.success('Ćwiczenie dodane!')
  }

  return (
    <div className="page-shell">

      {/* ── Mobile sticky header ─────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-40 lg:hidden flex items-center gap-3 px-4"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          paddingBottom: '0.75rem',
          background: 'rgba(8,6,26,0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(128,140,179,0.12)',
        }}
      >
        <Dumbbell size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span className="text-sm font-semibold text-white flex-1">Baza ćwiczeń</span>
        <motion.button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
          style={{ background: 'var(--accent)', color: '#08061A' }}
          whileTap={{ scale: 0.93 }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Dodaj własne
        </motion.button>
      </div>

      <div className="page-container desktop-app-grid pt-[4.5rem] lg:pt-0">

        {/* ── Desktop sidebar ──────────────────────── */}
        <aside className="hidden lg:block desktop-sticky">
          <div className="surface-panel rounded-[2rem] p-5 space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] mb-4" style={{ color: 'var(--accent)' }}>
                Baza ćwiczeń
              </p>

              {/* Search */}
              <div className="relative mb-5">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input
                  type="text"
                  placeholder="Szukaj..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-xl py-2 pl-8 pr-3 text-sm outline-none text-white"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                />
              </div>
            </div>

            <SidebarFilter
              title="Kategoria"
              options={CATEGORIES}
              labels={CATEGORY_LABELS}
              active={category}
              onSelect={setCategory}
            />

            <SidebarFilter
              title="Sprzęt"
              options={EQUIPMENT_OPTIONS}
              labels={EQUIPMENT_LABELS}
              active={equipment}
              onSelect={setEquipment}
            />

            <motion.button
              onClick={() => setShowForm(true)}
              className="w-full rounded-[1.4rem] py-3 text-sm font-semibold tracking-wide flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: '#08061A' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={16} strokeWidth={2.5} />
              Dodaj własne ćwiczenie
            </motion.button>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────── */}
        <main className="min-w-0 pb-28 lg:pb-0">

          {/* Mobile: search + filter chips */}
          <div className="lg:hidden space-y-3 mb-5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Szukaj ćwiczenia..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-xl py-2.5 pl-8 pr-3 text-sm outline-none text-white"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
              />
            </div>
            <ChipRow options={CATEGORIES} labels={CATEGORY_LABELS} active={category} onSelect={setCategory} />
            <ChipRow options={EQUIPMENT_OPTIONS} labels={EQUIPMENT_LABELS} active={equipment} onSelect={setEquipment} />
          </div>

          {/* Desktop page title */}
          <div className="hidden lg:block mb-6">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Katalog</p>
            <h1 className="mt-1 text-2xl font-bold text-white">Baza ćwiczeń</h1>
          </div>

          {/* User exercises section */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="Moje ćwiczenia" count={filteredUser.length} />
            </div>

            {loadingUser ? (
              <div className="surface-panel rounded-[1.5rem] px-5 py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Ładowanie...</p>
              </div>
            ) : filteredUser.length === 0 ? (
              <div className="surface-panel rounded-[1.5rem] px-5 py-8 text-center">
                {userExercises.length === 0 ? (
                  <>
                    <p className="text-sm font-semibold text-white mb-1">Brak własnych ćwiczeń</p>
                    <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                      Dodaj własne ćwiczenie, żeby pojawilo się tutaj i w pickerze treningu.
                    </p>
                    <motion.button
                      onClick={() => setShowForm(true)}
                      className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold"
                      style={{ background: 'var(--accent)', color: '#08061A' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Plus size={13} strokeWidth={2.5} />
                      Dodaj pierwsze
                    </motion.button>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    Brak wyników dla wybranych filtrów.
                  </p>
                )}
              </div>
            ) : (
              <AnimatePresence initial={false}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredUser.map((ex) => (
                    <motion.div
                      key={ex.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ExerciseCard exercise={ex} isUser />
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            )}
          </section>

          {/* Global exercises section */}
          <section>
            <SectionHeader title="Katalog globalny" count={filteredGlobal.length} />

            {filteredGlobal.length === 0 ? (
              <div className="surface-panel rounded-[1.5rem] px-5 py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Brak wyników dla wybranych filtrów.</p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredGlobal.map((ex) => (
                  <ExerciseCard key={ex.id} exercise={ex} isUser={false} />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Create form modal */}
      <AnimatePresence>
        {showForm && (
          <CreateExerciseForm
            onSubmit={handleCreate}
            onClose={() => setShowForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
