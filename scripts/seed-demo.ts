import { getApps } from 'firebase-admin/app'
import { adminAuth, adminDb } from '../api/lib/firebaseAdmin.js'
import { materializeWorkoutForUser } from '../api/lib/workoutProjection.js'
import {
  assertDemoSeedConfirmation,
  validateDemoSeedSnapshot,
  type DemoSeedExpectations,
  type DemoSeedSnapshot,
} from './demoSeedContract.js'

/**
 * Seed demo account with 26 realistic workouts across ~60 days.
 *
 * Usage:
 *   DEMO_SEED_CONFIRM_EMAIL=demo@ironlog.app \
 *   DEMO_SEED_CONFIRM_PROJECT_ID=ironlog-ede05 \
 *   npm run seed:demo [-- --dry-run]
 *
 * Konta pisze:
 *   - workouts (26 w ostatnich 60 dniach)
 *   - exerciseSessions + records (przez materializację)
 *   - userExercises (4 custom)
 *   - templates (1 Upper/Lower)
 *   - readiness (ostatnie 7 dni)
 * Wyczyści poprzednie dane demo konta przed seedem (idempotent).
 */

// === CONFIG — edit freely ===
const DEMO_EMAIL = 'demo@ironlog.app'
const WEEKS_OF_HISTORY = 8

// === TYPES ===
type ExerciseSource = 'global' | 'user'

interface SetSpec {
  weight: number
  reps: number
}

interface WorkoutExerciseSpec {
  exerciseId: string
  exerciseSource: ExerciseSource
  name: string
  sets: SetSpec[]
}

interface ScheduledWorkout {
  label: string
  daysAgo: number
  durationMin: number
  exercises: WorkoutExerciseSpec[]
}

// === HELPERS ===
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

// Progresja liniowa od base do base+gain w totalWeeks. weekIdx 0..totalWeeks-1.
function progress(base: number, gain: number, weekIdx: number, totalWeeks: number, step = 2.5): number {
  const pct = weekIdx / Math.max(totalWeeks - 1, 1)
  return roundTo(base + gain * pct, step)
}

// Set pattern: górne sety pełne, ostatnie 1-2 z drop repów (realistyczne zmęczenie).
function fatiguedSets(count: number, weight: number, topReps: number): SetSpec[] {
  const sets: SetSpec[] = []
  for (let i = 0; i < count; i++) {
    const fromEnd = count - 1 - i
    const drop = fromEnd === 0 ? 2 : fromEnd === 1 ? 1 : 0
    sets.push({ weight, reps: Math.max(topReps - drop, 3) })
  }
  return sets
}

// Stały reps across sets (np. izolacje 3x12).
function flatSets(count: number, weight: number, reps: number): SetSpec[] {
  return Array.from({ length: count }, () => ({ weight, reps }))
}

// === USER EXERCISES (4 custom) ===
interface UserExerciseSeed {
  id: string
  name: string
  category: string
  equipment: string
  muscles: string[]
}

const USER_EXERCISES: UserExerciseSeed[] = [
  {
    id: 'ue_hip_thrust',
    name: 'Hip Thrust',
    category: 'legs',
    equipment: 'barbell',
    muscles: ['glutes', 'hamstrings'],
  },
  {
    id: 'ue_bulgarian_split_squat',
    name: 'Bulgarian Split Squat',
    category: 'legs',
    equipment: 'dumbbell',
    muscles: ['quads', 'glutes'],
  },
  {
    id: 'ue_cable_crunch',
    name: 'Cable Crunch',
    category: 'core',
    equipment: 'cable',
    muscles: ['core'],
  },
  {
    id: 'ue_chest_supported_row',
    name: 'Chest-Supported Row',
    category: 'back',
    equipment: 'dumbbell',
    muscles: ['back', 'biceps'],
  },
]

const READINESS_PATTERNS = [
  { sleep: 4, mood: 4, soreness: 2 },
  { sleep: 3, mood: 3, soreness: 3 },
  { sleep: 5, mood: 5, soreness: 1 },
  { sleep: 4, mood: 4, soreness: 2 },
  { sleep: 3, mood: 4, soreness: 3 },
  { sleep: 4, mood: 3, soreness: 2 },
  { sleep: 5, mood: 5, soreness: 2 },
] as const

// === WORKOUT BUILDERS — per split day, parametrized by week ===
function upperA(week: number): WorkoutExerciseSpec[] {
  const benchKg = progress(60, 12.5, week, WEEKS_OF_HISTORY)
  const rowKg = progress(55, 15, week, WEEKS_OF_HISTORY)
  const inclineKg = progress(20, 5, week, WEEKS_OF_HISTORY, 2.5) // dumbbell per hand
  const pulldownKg = progress(50, 15, week, WEEKS_OF_HISTORY)
  const curlKg = progress(20, 7.5, week, WEEKS_OF_HISTORY, 2.5)
  const pushdownKg = progress(25, 10, week, WEEKS_OF_HISTORY, 2.5)

  return [
    {
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: fatiguedSets(4, benchKg, 8),
    },
    {
      exerciseId: 'barbell-row',
      exerciseSource: 'global',
      name: 'Barbell Row',
      sets: fatiguedSets(4, rowKg, 8),
    },
    {
      exerciseId: 'incline-bench',
      exerciseSource: 'global',
      name: 'Incline Bench Press',
      sets: fatiguedSets(3, inclineKg + 20, 10),
    },
    {
      exerciseId: 'lat-pulldown',
      exerciseSource: 'global',
      name: 'Lat Pulldown',
      sets: flatSets(3, pulldownKg, 12),
    },
    {
      exerciseId: 'barbell-curl',
      exerciseSource: 'global',
      name: 'Barbell Curl',
      sets: fatiguedSets(3, curlKg, 12),
    },
    {
      exerciseId: 'tricep-pushdown',
      exerciseSource: 'global',
      name: 'Tricep Pushdown',
      sets: flatSets(3, pushdownKg, 12),
    },
  ]
}

function lowerA(week: number): WorkoutExerciseSpec[] {
  const squatKg = progress(80, 20, week, WEEKS_OF_HISTORY)
  const rdlKg = progress(70, 15, week, WEEKS_OF_HISTORY)
  const legPressKg = progress(120, 40, week, WEEKS_OF_HISTORY, 5)
  const legCurlKg = progress(35, 15, week, WEEKS_OF_HISTORY, 2.5)
  const hipThrustKg = progress(80, 30, week, WEEKS_OF_HISTORY, 5)

  return [
    {
      exerciseId: 'squat',
      exerciseSource: 'global',
      name: 'Squat',
      sets: fatiguedSets(4, squatKg, 6),
    },
    {
      exerciseId: 'romanian-dl',
      exerciseSource: 'global',
      name: 'Romanian Deadlift',
      sets: fatiguedSets(3, rdlKg, 8),
    },
    {
      exerciseId: 'leg-press',
      exerciseSource: 'global',
      name: 'Leg Press',
      sets: flatSets(3, legPressKg, 12),
    },
    {
      exerciseId: 'leg-curl',
      exerciseSource: 'global',
      name: 'Leg Curl',
      sets: flatSets(3, legCurlKg, 12),
    },
    {
      exerciseId: USER_EXERCISES[0].id,
      exerciseSource: 'user',
      name: USER_EXERCISES[0].name,
      sets: fatiguedSets(3, hipThrustKg, 10),
    },
  ]
}

function upperB(week: number): WorkoutExerciseSpec[] {
  const ohpKg = progress(40, 10, week, WEEKS_OF_HISTORY, 1.25)
  const pullupAdded = progress(0, 10, week, WEEKS_OF_HISTORY, 2.5) // bw + added
  const benchLightKg = progress(50, 10, week, WEEKS_OF_HISTORY)
  const rowKg = progress(40, 12.5, week, WEEKS_OF_HISTORY, 2.5) // chest-supported row (user)
  const lateralKg = progress(8, 4, week, WEEKS_OF_HISTORY, 1)
  const hammerKg = progress(12, 4, week, WEEKS_OF_HISTORY, 1)

  return [
    {
      exerciseId: 'ohp',
      exerciseSource: 'global',
      name: 'Overhead Press',
      sets: fatiguedSets(4, ohpKg, 6),
    },
    {
      exerciseId: 'pull-up',
      exerciseSource: 'global',
      name: 'Pull-up',
      sets: fatiguedSets(4, pullupAdded, 8),
    },
    {
      exerciseId: 'bench-press',
      exerciseSource: 'global',
      name: 'Bench Press',
      sets: flatSets(3, benchLightKg, 10),
    },
    {
      exerciseId: USER_EXERCISES[3].id,
      exerciseSource: 'user',
      name: USER_EXERCISES[3].name,
      sets: flatSets(3, rowKg, 12),
    },
    {
      exerciseId: 'db-lateral-raise',
      exerciseSource: 'global',
      name: 'Lateral Raise',
      sets: flatSets(4, lateralKg, 15),
    },
    {
      exerciseId: 'hammer-curl',
      exerciseSource: 'global',
      name: 'Hammer Curl',
      sets: fatiguedSets(3, hammerKg, 12),
    },
  ]
}

function lowerB(week: number): WorkoutExerciseSpec[] {
  const deadliftKg = progress(100, 20, week, WEEKS_OF_HISTORY)
  const bulgarianKg = progress(14, 6, week, WEEKS_OF_HISTORY, 1) // db per hand
  const legExtKg = progress(40, 15, week, WEEKS_OF_HISTORY, 2.5)
  const crunchKg = progress(25, 10, week, WEEKS_OF_HISTORY, 2.5)
  const lungeKg = progress(14, 4, week, WEEKS_OF_HISTORY, 1)

  return [
    {
      exerciseId: 'deadlift',
      exerciseSource: 'global',
      name: 'Deadlift',
      sets: fatiguedSets(3, deadliftKg, 5),
    },
    {
      exerciseId: USER_EXERCISES[1].id,
      exerciseSource: 'user',
      name: USER_EXERCISES[1].name,
      sets: fatiguedSets(3, bulgarianKg, 10),
    },
    {
      exerciseId: 'leg-extension',
      exerciseSource: 'global',
      name: 'Leg Extension',
      sets: flatSets(3, legExtKg, 15),
    },
    {
      exerciseId: 'lunge',
      exerciseSource: 'global',
      name: 'Lunge',
      sets: flatSets(3, lungeKg, 12),
    },
    {
      exerciseId: USER_EXERCISES[2].id,
      exerciseSource: 'user',
      name: USER_EXERCISES[2].name,
      sets: flatSets(3, crunchKg, 15),
    },
  ]
}

// === SCHEDULE — 26 workouts over ~56 days ===
// Format: [daysAgo, splitName]. Sorted newest-first in source, but seeded oldest-first.
// Gaps simulate rest days, busy weeks, an illness week around day 28.
const SCHEDULE: Array<{ daysAgo: number; split: 'UA' | 'LA' | 'UB' | 'LB' }> = [
  // Week 1 (56-50 days ago)
  { daysAgo: 56, split: 'UA' },
  { daysAgo: 55, split: 'LA' },
  { daysAgo: 53, split: 'UB' },
  { daysAgo: 52, split: 'LB' },
  // Week 2 (49-43 days ago)
  { daysAgo: 49, split: 'UA' },
  { daysAgo: 48, split: 'LA' },
  { daysAgo: 45, split: 'UB' },
  // Week 3 (42-36 days ago)
  { daysAgo: 42, split: 'UA' },
  { daysAgo: 41, split: 'LA' },
  { daysAgo: 39, split: 'UB' },
  { daysAgo: 38, split: 'LB' },
  // Week 4 (35-29 days ago) — lekki deload
  { daysAgo: 35, split: 'UA' },
  { daysAgo: 32, split: 'LA' },
  // Week 5 (28-22 days ago) — przeziębienie w okolicach dnia 28
  { daysAgo: 25, split: 'UB' },
  { daysAgo: 23, split: 'LB' },
  // Week 6 (21-15 days ago)
  { daysAgo: 21, split: 'UA' },
  { daysAgo: 20, split: 'LA' },
  { daysAgo: 17, split: 'UB' },
  // Week 7 (14-8 days ago)
  { daysAgo: 14, split: 'UA' },
  { daysAgo: 13, split: 'LA' },
  { daysAgo: 11, split: 'UB' },
  { daysAgo: 10, split: 'LB' },
  // Week 8 (7-0 days ago) — this week, active streak
  { daysAgo: 7, split: 'UA' },
  { daysAgo: 6, split: 'LA' },
  { daysAgo: 3, split: 'UB' },
  { daysAgo: 1, split: 'LB' },
]

function buildSchedule(): ScheduledWorkout[] {
  return SCHEDULE.map(({ daysAgo, split }) => {
    const weekIdx = Math.floor((56 - daysAgo) / 7)
    const splitMap = {
      UA: { label: 'Upper A', fn: upperA },
      LA: { label: 'Lower A', fn: lowerA },
      UB: { label: 'Upper B', fn: upperB },
      LB: { label: 'Lower B', fn: lowerB },
    } as const

    const { label, fn } = splitMap[split]
    return {
      label,
      daysAgo,
      durationMin: 55 + ((weekIdx * 13) % 20), // 55-75 min, deterministic variance
      exercises: fn(weekIdx),
    }
  })
}

function buildExpectations(): DemoSeedExpectations {
  const schedule = buildSchedule()

  return {
    workoutCount: schedule.length,
    templateCount: 1,
    userExerciseCount: USER_EXERCISES.length,
    readinessCount: READINESS_PATTERNS.length,
    maxDurationMin: Math.max(...schedule.map((workout) => workout.durationMin)),
  }
}

async function readDemoSnapshot(userId: string): Promise<DemoSeedSnapshot> {
  const [workouts, templates, userExercises, readiness, activeSession] = await Promise.all([
    adminDb.collection('workouts').where('userId', '==', userId).get(),
    adminDb.collection('templates').where('userId', '==', userId).get(),
    adminDb.collection('userExercises').where('userId', '==', userId).get(),
    adminDb.collection('readiness').where('userId', '==', userId).get(),
    adminDb.collection('activeSessions').doc(userId).get(),
  ])

  const durations = workouts.docs.map((document) => {
    const data = document.data()
    const startedAt = typeof data.startedAt === 'number' ? data.startedAt : 0
    const finishedAt = typeof data.finishedAt === 'number' ? data.finishedAt : 0
    return Math.max(0, finishedAt - startedAt) / 60_000
  })

  return {
    workoutCount: workouts.size,
    templateCount: templates.size,
    userExerciseCount: userExercises.size,
    readinessCount: readiness.size,
    maxDurationMin: durations.length > 0 ? Math.max(...durations) : 0,
    blankWorkoutLabels: workouts.docs.filter((document) => {
      const label = document.data().label
      return typeof label !== 'string' || label.trim().length === 0
    }).length,
    hasActiveSession: activeSession.exists,
  }
}

function printSnapshot(snapshot: DemoSeedSnapshot, issues: string[]): void {
  console.log('\n🔎 Snapshot demo (tylko odczyt):')
  console.log(`   Treningi: ${snapshot.workoutCount}`)
  console.log(`   Szablony: ${snapshot.templateCount}`)
  console.log(`   Własne ćwiczenia: ${snapshot.userExerciseCount}`)
  console.log(`   Ankiety gotowości: ${snapshot.readinessCount}`)
  console.log(`   Maksymalny czas treningu: ${snapshot.maxDurationMin} min`)
  console.log(`   Puste etykiety treningów: ${snapshot.blankWorkoutLabels}`)
  console.log(`   Aktywna sesja: ${snapshot.hasActiveSession ? 'tak' : 'nie'}`)

  if (issues.length === 0) {
    console.log('   ✓ Snapshot spełnia kontrakt fixture’ów.')
    return
  }

  console.log('   Problemy:')
  issues.forEach((issue) => console.log(`   - ${issue}`))
}

// === FIRESTORE WRITERS ===
async function deleteAllInCollectionForUser(collection: string, userId: string): Promise<number> {
  const snap = await adminDb.collection(collection).where('userId', '==', userId).get()
  if (snap.empty) return 0

  // Firestore batch limit: 500
  let deleted = 0
  const chunks: FirebaseFirestore.DocumentReference[][] = []
  const refs = snap.docs.map((d) => d.ref)
  for (let i = 0; i < refs.length; i += 450) {
    chunks.push(refs.slice(i, i + 450))
  }
  for (const chunk of chunks) {
    const batch = adminDb.batch()
    chunk.forEach((ref) => batch.delete(ref))
    await batch.commit()
    deleted += chunk.length
  }
  return deleted
}

async function resetDemo(userId: string): Promise<void> {
  console.log('\n🧹 Czyszczenie poprzednich danych demo...')
  const collections = [
    'workouts',
    'exerciseSessions',
    'records',
    'userExercises',
    'templates',
    'readiness',
    'chatMessages',
  ]
  for (const col of collections) {
    const count = await deleteAllInCollectionForUser(col, userId)
    if (count > 0) console.log(`   ✓ ${col}: usunięto ${count}`)
  }
  // activeSessions/{uid} — single doc
  await adminDb.collection('activeSessions').doc(userId).delete().catch(() => {})
}

async function seedUserExercises(userId: string): Promise<void> {
  console.log('\n💪 Seed custom ćwiczeń...')
  const batch = adminDb.batch()
  for (const ex of USER_EXERCISES) {
    const ref = adminDb.collection('userExercises').doc(ex.id)
    batch.set(ref, {
      userId,
      name: ex.name,
      category: ex.category,
      equipment: ex.equipment,
      muscles: ex.muscles,
    })
  }
  await batch.commit()
  console.log(`   ✓ ${USER_EXERCISES.length} ćwiczeń`)
}

async function seedTemplate(userId: string): Promise<void> {
  console.log('\n📋 Seed szablonu treningowego...')
  const now = Date.now()
  // Build template from last-week weights
  const lastWeek = WEEKS_OF_HISTORY - 1
  const ua = upperA(lastWeek)
  const la = lowerA(lastWeek)
  const ub = upperB(lastWeek)
  const lb = lowerB(lastWeek)

  const toTemplateExercise = (ex: WorkoutExerciseSpec) => ({
    exerciseId: ex.exerciseId,
    exerciseSource: ex.exerciseSource,
    name: ex.name,
    sets: ex.sets.length,
    targetReps: ex.sets[0]?.reps ?? 8,
    targetWeight: ex.sets[0]?.weight ?? 0,
  })

  const templateRef = adminDb.collection('templates').doc()
  await templateRef.set({
    userId,
    name: 'Upper / Lower 4×',
    createdAt: now,
    updatedAt: now,
    days: [
      { name: 'Upper A', exercises: ua.map(toTemplateExercise) },
      { name: 'Lower A', exercises: la.map(toTemplateExercise) },
      { name: 'Upper B', exercises: ub.map(toTemplateExercise) },
      { name: 'Lower B', exercises: lb.map(toTemplateExercise) },
    ],
  })
  console.log('   ✓ "Upper / Lower 4×"')
}

async function seedWorkouts(userId: string): Promise<string[]> {
  console.log('\n🏋️  Seed treningów...')
  const schedule = buildSchedule().sort((a, b) => b.daysAgo - a.daysAgo) // oldest first
  const dayMs = 24 * 60 * 60 * 1000
  const workoutIds: string[] = []

  for (const entry of schedule) {
    // Start at roughly 18:00 local (18 hours past midnight)
    const baseDay = Date.now() - entry.daysAgo * dayMs
    const startOfDay = new Date(baseDay)
    startOfDay.setHours(18, 15, 0, 0)
    const startedAt = startOfDay.getTime()
    const finishedAt = startedAt + entry.durationMin * 60 * 1000

    const ref = adminDb.collection('workouts').doc()
    await ref.set({
      userId,
      startedAt,
      finishedAt,
      label: entry.label,
      materialized: false,
      exercises: entry.exercises,
    })
    workoutIds.push(ref.id)
  }
  console.log(`   ✓ ${workoutIds.length} treningów zapisanych`)
  return workoutIds
}

async function materializeAll(userId: string, workoutIds: string[]): Promise<void> {
  console.log('\n⚙️  Materializacja (liczenie wolumenu i rekordów)...')
  for (let i = 0; i < workoutIds.length; i++) {
    await materializeWorkoutForUser(userId, workoutIds[i])
    process.stdout.write(`\r   ✓ ${i + 1}/${workoutIds.length}`)
  }
  console.log('')
}

async function seedReadiness(userId: string): Promise<void> {
  console.log('\n🧠 Seed ankiet gotowości (ostatnie 7 dni)...')
  const dayMs = 24 * 60 * 60 * 1000
  const batch = adminDb.batch()
  const now = Date.now()

  for (let i = 0; i < READINESS_PATTERNS.length; i++) {
    const ts = now - i * dayMs
    const date = new Date(ts)
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    const id = `${userId}_${dateStr}`

    const ref = adminDb.collection('readiness').doc(id)
    batch.set(ref, {
      userId,
      date: dateStr,
      ...READINESS_PATTERNS[i],
      createdAt: ts,
    })
  }
  await batch.commit()
  console.log(`   ✓ ${READINESS_PATTERNS.length} wpisów`)
}

// === MAIN ===
class SafeOperationalError extends Error {}

function parseDryRun(args: string[]): boolean {
  const unexpected = args.filter((arg) => arg !== '--dry-run')
  if (unexpected.length > 0) {
    throw new SafeOperationalError('Nieznany argument. Obsługiwany jest wyłącznie --dry-run.')
  }
  return args.includes('--dry-run')
}

async function main(): Promise<void> {
  const dryRun = parseDryRun(process.argv.slice(2))
  const actualProjectId = getApps()[0]?.options.projectId ?? ''

  let userRecord
  try {
    userRecord = await adminAuth.getUserByEmail(DEMO_EMAIL)
  } catch {
    throw new SafeOperationalError(
      `Nie znaleziono użytkownika ${DEMO_EMAIL} w Firebase Auth.`,
    )
  }

  const userId = userRecord.uid
  try {
    assertDemoSeedConfirmation({
      actualEmail: userRecord.email ?? '',
      expectedEmail: DEMO_EMAIL,
      actualProjectId,
      confirmedEmail: process.env.DEMO_SEED_CONFIRM_EMAIL,
      confirmedProjectId: process.env.DEMO_SEED_CONFIRM_PROJECT_ID,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nieznany błąd preflightu.'
    throw new SafeOperationalError(`Preflight odrzucony: ${message}`)
  }

  const expectations = buildExpectations()

  console.log('\n🌱 IronLog demo seed')
  console.log(`   Tryb: ${dryRun ? 'dry-run (tylko odczyt)' : 'reset i deterministyczny reseed'}`)
  console.log(`   Konto docelowe: ${DEMO_EMAIL}`)
  console.log(`   Projekt Firebase: ${actualProjectId}`)

  if (dryRun) {
    const snapshot = await readDemoSnapshot(userId)
    printSnapshot(snapshot, validateDemoSeedSnapshot(snapshot, expectations))
    console.log('\nℹ️  Dry-run zakończony. Nie wykonano resetu, zapisu ani materializacji.\n')
    return
  }

  await resetDemo(userId)
  await seedUserExercises(userId)
  await seedTemplate(userId)
  const workoutIds = await seedWorkouts(userId)
  await materializeAll(userId, workoutIds)
  await seedReadiness(userId)

  const snapshot = await readDemoSnapshot(userId)
  const issues = validateDemoSeedSnapshot(snapshot, expectations)
  printSnapshot(snapshot, issues)
  if (issues.length > 0) {
    throw new SafeOperationalError('Walidacja snapshotu po reseedzie nie powiodła się.')
  }

  console.log(`\n✅ Gotowe. Zaloguj się jako ${DEMO_EMAIL} i rób screeny.\n`)
}

main().then(() => {
  process.exit(0)
}).catch((error) => {
  if (error instanceof SafeOperationalError) {
    console.error(`\n❌ ${error.message}\n`)
  } else {
    console.error('\n❌ Seed failed. Szczegóły pominięto, aby nie ujawnić danych uwierzytelniających.\n')
  }
  process.exit(1)
})
