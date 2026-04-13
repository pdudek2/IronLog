import React, { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Dumbbell, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { exercises, type Category, type Equipment, type Exercise, type MuscleGroup } from '../data/exercises'
import {
  createUserExercise,
  deleteUserExercise,
  getUserExercises,
  updateUserExercise,
  type UserExerciseInput,
} from '../lib/userExercisesService'
import AppShell from '../components/AppShell'
import { useDialogA11y } from '../hooks/useDialogA11y'
import ConfirmDialog from '../components/ConfirmDialog'

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
  mode: 'create' | 'edit'
  initialValue?: UserExerciseInput
  onSubmit: (input: UserExerciseInput) => Promise<void>
  onClose: () => void
}

function CreateExerciseForm({ mode, initialValue, onSubmit, onClose }: CreateFormProps) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [category, setCategory] = useState<Category>(initialValue?.category ?? 'chest')
  const [equipment, setEquipment] = useState<Equipment>(initialValue?.equipment ?? 'barbell')
  const [muscles, setMuscles] = useState<MuscleGroup[]>(initialValue?.muscles ?? [])
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu. Spróbuj ponownie.')
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
        className="surface-panel flex flex-col overflow-hidden rounded-t-[var(--radius-xl)] sm:mx-auto sm:rounded-[var(--radius-xl)] sm:max-w-lg"
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
            {mode === 'edit' ? 'Edytuj własne ćwiczenie' : 'Dodaj własne ćwiczenie'}
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
                      background: active ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                      color: active ? 'var(--text-strong)' : 'var(--muted)',
                      border: `1px solid ${active ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
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
            className="w-full rounded-[var(--radius-lg)] py-3.5 text-sm font-semibold disabled:opacity-50"
            style={{
              background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
              color: 'var(--accent-foreground)',
            }}
            whileTap={{ scale: 0.97 }}
          >
            {saving ? 'Zapisuję...' : mode === 'edit' ? 'Zapisz zmiany' : 'Dodaj ćwiczenie'}
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
  onEdit?: () => void
  onDelete?: () => void
  onNavigate: () => void
}

function ExerciseCard({ exercise, isUser, onEdit, onDelete, onNavigate }: CardProps) {
  const muscleText = exercise.muscles.map((m) => MUSCLE_LABELS[m]).join(', ')
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigate()}
      className="rounded-[1.25rem] px-4 py-4 cursor-pointer transition-colors hover:border-[rgba(154,167,194,0.28)]"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${isUser ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-medium text-white leading-snug">{exercise.name}</p>
        {isUser && (
          <span
            className="flex-none text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            moje
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        {EQUIPMENT_LABELS[exercise.equipment]}
        {muscleText ? ` · ${muscleText}` : ''}
      </p>
      {isUser && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.() }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'var(--card)', color: 'white', border: '1px solid var(--border)' }}
          >
            <Pencil size={12} />
            Edytuj
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.() }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'rgba(255,87,87,0.08)', color: '#FF5757', border: '1px solid rgba(255,87,87,0.18)' }}
          >
            <Trash2 size={12} />
            Usuń
          </button>
        </div>
      )}
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
            background: active === opt ? 'var(--accent-soft)' : 'var(--card)',
            color: active === opt ? 'var(--text-strong)' : 'var(--muted)',
            border: `1px solid ${active === opt ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
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
              background: active === opt ? 'var(--accent-soft)' : 'transparent',
              color: active === opt ? 'var(--text-strong)' : 'var(--muted)',
              border: active === opt ? '1px solid var(--accent-soft-strong)' : '1px solid transparent',
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

function SectionHeader({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string
  title: string
  count: number
}) {
  return (
    <div className="mb-3 lg:mb-4">
      <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--muted)' }}>{eyebrow}</p>
      <div className="mt-1 flex items-center gap-3">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', border: '1px solid var(--border)' }}
        >
          {count}
        </span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const [userExercises, setUserExercises] = useState<Exercise[]>([])
  const [loadingUser, setLoadingUser] = useState(true)
  const [formExercise, setFormExercise] = useState<Exercise | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmDeleteExercise, setConfirmDeleteExercise] = useState<Exercise | null>(null)

  useEffect(() => {
    if (!user) return
    getUserExercises(user.uid)
      .then(setUserExercises)
      .catch((err) => {
        console.error('[userExercises load error]', err)
        toast.error('Nie udało się wczytać Twoich ćwiczeń.')
      })
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
    setFormExercise(null)
    toast.success('Ćwiczenie dodane!')
  }

  async function handleUpdate(input: UserExerciseInput) {
    if (!formExercise) return
    await updateUserExercise(formExercise.id, input)
    setUserExercises((prev) => prev.map((exercise) => (
      exercise.id === formExercise.id ? { ...exercise, ...input } : exercise
    )))
    setShowForm(false)
    setFormExercise(null)
    toast.success('Ćwiczenie zaktualizowane!')
  }

  async function handleDeleteConfirmed() {
    if (!confirmDeleteExercise) return

    const deletingId = confirmDeleteExercise.id
    setConfirmDeleteExercise(null)

    try {
      await deleteUserExercise(deletingId)
      setUserExercises((prev) => prev.filter((exercise) => exercise.id !== deletingId))
      toast.success('Ćwiczenie usunięte!')
    } catch (err) {
      console.error('[userExercise delete error]', err)
      toast.error('Nie udało się usunąć ćwiczenia.')
    }
  }

  function openCreateForm() {
    setFormExercise(null)
    setShowForm(true)
  }

  function openEditForm(exercise: Exercise) {
    setFormExercise(exercise)
    setShowForm(true)
  }

  return (
    <AppShell current="exercises">

      {/* ── Mobile sticky header ─────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-40 lg:hidden flex items-center gap-3 px-4"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          paddingBottom: '0.75rem',
          background: 'rgba(10, 14, 22, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Dumbbell size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span className="text-sm font-semibold text-white flex-1">Baza ćwiczeń</span>
        <motion.button
          onClick={openCreateForm}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold"
          style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
          whileTap={{ scale: 0.93 }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Dodaj własne
        </motion.button>
      </div>

      <div className="desktop-app-grid pt-[4.5rem] lg:pt-0">

        {/* ── Desktop sidebar ──────────────────────── */}
        <aside className="hidden lg:block desktop-sticky">
          <div className="surface-panel rounded-[var(--radius-xl)] p-5 space-y-5">
            <div>
              <p className="eyebrow mb-4" style={{ color: 'var(--accent)' }}>
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
              onClick={openCreateForm}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] py-3 text-sm font-semibold"
              style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={16} strokeWidth={2.5} />
              Dodaj własne ćwiczenie
            </motion.button>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────── */}
        <main className="min-w-0 pb-36 lg:pb-0">

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
            <p className="eyebrow">Katalog</p>
            <h1 className="mt-2 section-title">Baza ćwiczeń</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
              Globalny atlas i własna biblioteka użytkownika w jednym miejscu, gotowe pod wybór do sesji i dalszą analitykę.
            </p>
          </div>

          {/* User exercises section */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader eyebrow="Własna biblioteka" title="Moje ćwiczenia" count={filteredUser.length} />
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
                      onClick={openCreateForm}
                      className="inline-flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-xs font-semibold"
                      style={{ background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)', color: 'var(--accent-foreground)' }}
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
                      <ExerciseCard
                        exercise={ex}
                        isUser
                        onEdit={() => openEditForm(ex)}
                        onDelete={() => setConfirmDeleteExercise(ex)}
                        onNavigate={() => navigate(`/exercises/user/${ex.id}`)}
                      />
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            )}
          </section>

          {/* Global exercises section */}
          <section>
            <SectionHeader eyebrow="Atlas startowy" title="Katalog globalny" count={filteredGlobal.length} />

            {filteredGlobal.length === 0 ? (
              <div className="surface-panel rounded-[1.5rem] px-5 py-8 text-center">
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Brak wyników dla wybranych filtrów.</p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredGlobal.map((ex) => (
                  <ExerciseCard key={ex.id} exercise={ex} isUser={false} onNavigate={() => navigate(`/exercises/global/${ex.id}`)} />
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
            mode={formExercise ? 'edit' : 'create'}
            initialValue={formExercise ? {
              name: formExercise.name,
              category: formExercise.category,
              equipment: formExercise.equipment,
              muscles: formExercise.muscles,
            } : undefined}
            onSubmit={formExercise ? handleUpdate : handleCreate}
            onClose={() => {
              setShowForm(false)
              setFormExercise(null)
            }}
          />
        )}
      </AnimatePresence>

      {confirmDeleteExercise && (
        <ConfirmDialog
          message={`Usunąć ćwiczenie "${confirmDeleteExercise.name}"? Nie będzie już dostępne w katalogu użytkownika.`}
          confirmLabel="Usuń"
          danger
          onConfirm={() => { void handleDeleteConfirmed() }}
          onCancel={() => setConfirmDeleteExercise(null)}
        />
      )}

    </AppShell>
  )
}
