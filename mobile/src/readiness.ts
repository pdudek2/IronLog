import { todayKey, type ReadinessEntry } from '../../src/shared/readiness'
import type { ReadResult } from './scopedRead'
import type { RecommendationWorkout } from '../../src/shared/nextSessionRecommendation'
import type { SavedWorkout } from './history'

export type ReadinessValues = Pick<ReadinessEntry, 'sleep' | 'mood' | 'soreness'>
export class ReadinessDataError extends Error {}
export class ReadinessNotSubmittedError extends Error {}

export function parseReadiness(uid: string, date: string, raw: unknown): ReadinessEntry {
  const data = raw as ReadinessEntry | null
  const parsed = new Date(`${date}T12:00:00`)
  if (!data || typeof data !== 'object' || Array.isArray(data) || !uid
    || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || todayKey(parsed) !== date
    || data.userId !== uid || data.date !== date
    || ![data.sleep, data.mood, data.soreness].every(value => Number.isInteger(value) && value >= 1 && value <= 5)
    || !Number.isSafeInteger(data.createdAt) || data.createdAt < 0) throw new ReadinessDataError('Readiness data is invalid. Retry before checking in.')
  return { userId: uid, date, sleep: data.sleep, mood: data.mood, soreness: data.soreness, createdAt: data.createdAt }
}

// Saved native sets are canonical kg. Keep source identity when adapting the read model.
export function recommendationHistory(workouts: SavedWorkout[]): RecommendationWorkout[] {
  return workouts.map(workout => ({ finishedAt: workout.finishedAt,
    exercises: workout.exercises.map(exercise => ({ exerciseId: exercise.exerciseId,
      exerciseSource: exercise.exerciseSource, sets: exercise.sets.map(set => ({ weight: set.weight, reps: set.reps })) })) }))
}

function sameEntry(left: ReadinessEntry | null, right: ReadinessEntry) {
  return !!left && left.userId === right.userId && left.date === right.date && left.createdAt === right.createdAt
    && left.sleep === right.sleep && left.mood === right.mood && left.soreness === right.soreness
}

export type ReadinessState = {
  date: string; status: 'loading' | 'ready' | 'cached' | 'invalid' | 'error'
  entry: ReadinessEntry | null; values: ReadinessValues | null
  busy: boolean; pending: boolean; message: string | null
}

export class ReadinessController {
  state: ReadinessState
  private generation = 0
  private alive = true
  private attempt: { entry: ReadinessEntry; status: 'pending' | 'saved' | 'failed'; result: Promise<void>; error?: unknown } | null = null
  constructor(private readonly uid: string, private readonly port: {
    read: (uid: string, date: string, server: boolean) => Promise<ReadResult<ReadinessEntry | null>>
    write: (entry: ReadinessEntry) => Promise<void>
    now: () => Date
  }, private readonly publish: (state: ReadinessState) => void, private readonly milliseconds = 15_000) {
    this.state = { date: todayKey(port.now()), status: 'loading', entry: null, values: null, busy: false, pending: false, message: null }
  }
  private set(patch: Partial<ReadinessState>) { this.state = { ...this.state, ...patch }; if (this.alive) this.publish(this.state) }
  private async bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Could not confirm readiness. Reconnect and try again.')), this.milliseconds) })]) }
    finally { clearTimeout(timer) }
  }
  dispose() { this.alive = false; this.generation += 1 }
  refreshDay() {
    const date = todayKey(this.port.now())
    if (!this.alive || date === this.state.date) return
    this.generation += 1
    this.set({ date, status: 'loading', entry: null, values: null, message: this.attempt ? 'An earlier check-in still needs confirmation.' : null })
    void this.load()
  }
  change(values: ReadinessValues) {
    this.refreshDay()
    if (!this.alive || this.state.status !== 'ready' || this.state.entry || this.state.busy || this.attempt) return
    parseReadiness(this.uid, this.state.date, { ...values, userId: this.uid, date: this.state.date, createdAt: 0 })
    this.set({ values: { ...values }, message: null })
  }
  async load(server = false) {
    if (!this.alive) return
    this.refreshDay()
    const date = this.state.date
    if (this.attempt?.entry.date === date) return this.reconcile()
    const generation = ++this.generation
    this.set({ status: 'loading', message: this.attempt ? 'An earlier check-in still needs confirmation.' : null })
    try {
      const result = await this.bounded(this.port.read(this.uid, date, server))
      this.refreshDay()
      if (!this.alive || generation !== this.generation || date !== this.state.date) return
      const entry = result.data ? parseReadiness(this.uid, date, result.data) : null
      this.set({ status: result.fromCache ? 'cached' : 'ready', entry,
        values: entry ?? (result.fromCache ? null : this.state.values ?? { sleep: 3, mood: 3, soreness: 3 }),
        message: result.fromCache ? 'Could not confirm today’s check-in. Reconnect and retry.' : this.state.message })
    } catch (error) {
      this.refreshDay()
      if (this.alive && generation === this.generation) this.set({ status: error instanceof ReadinessDataError ? 'invalid' : 'error', entry: null, message: error instanceof ReadinessDataError ? error.message : 'Could not load readiness. Check your connection and try again.' })
    }
  }
  async save() {
    this.refreshDay()
    if (!this.alive || this.state.busy) return
    if (this.attempt) return this.reconcile()
    if (this.state.status !== 'ready' || this.state.entry || !this.state.values) return
    const entry = parseReadiness(this.uid, this.state.date, { ...this.state.values, userId: this.uid, date: this.state.date, createdAt: this.port.now().getTime() })
    this.generation += 1
    this.set({ busy: true, pending: true, message: null })
    const attempt = { entry, status: 'pending' as 'pending' | 'saved' | 'failed', result: Promise.resolve(), error: undefined as unknown }
    this.attempt = attempt
    attempt.result = Promise.resolve().then(() => this.port.write(entry)).then(() => { attempt.status = 'saved' }, error => { attempt.status = 'failed'; attempt.error = error })
    try { await this.bounded(attempt.result) } catch { /* Keep the original write until its outcome is known. */ }
    this.refreshDay()
    if (!this.alive) return
    this.set({ busy: false })
    const code = attempt.error && typeof attempt.error === 'object' && 'code' in attempt.error ? String(attempt.error.code) : ''
    if (attempt.status === 'failed' && (attempt.error instanceof ReadinessNotSubmittedError || attempt.error instanceof ReadinessDataError
      || ['permission-denied', 'invalid-argument'].some(value => code.endsWith(value)))) {
      this.attempt = null
      this.set({ pending: false, message: 'Could not save readiness. Your values were kept; try again.' })
      return
    }
    await this.reconcile()
  }
  async reconcile() {
    const attempt = this.attempt
    if (!this.alive || !attempt || this.state.busy) return
    this.set({ busy: true, message: null })
    try {
      const read = await this.bounded(this.port.read(this.uid, attempt.entry.date, true))
      this.refreshDay()
      if (!this.alive || this.attempt !== attempt) return
      // Even a matching pre-commit server read cannot release a still-pending write.
      if (read.fromCache || attempt.status === 'pending') throw new Error('Save outcome unresolved. Reconnect and check again; workout access remains available.')
      const entry = read.data ? parseReadiness(this.uid, attempt.entry.date, read.data) : null
      this.attempt = null
      this.set({ pending: false, ...(this.state.date === attempt.entry.date
        ? sameEntry(entry, attempt.entry) ? { status: 'ready', entry, values: entry, message: 'Readiness saved' }
          : { message: 'Save was not confirmed. Your values were kept; review and save again.' }
        : { message: null }) })
    } catch (error) {
      if (this.alive) this.set({ message: error instanceof Error ? error.message : 'Could not confirm readiness.' })
    } finally { if (this.alive) this.set({ busy: false }) }
  }
}
