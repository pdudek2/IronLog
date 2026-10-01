import type { Units } from './session'

export const profileGoals = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Muscle growth' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'weight_loss', label: 'Fat loss' },
] as const
export type ProfileFields = { displayName: string; primaryGoal: typeof profileGoals[number]['value']; weeklyGoal: number; units: Units }
export type NativeProfile = ProfileFields & { createdAt: number }
export class ProfileDataError extends Error {}
export class ProfileNotSubmittedError extends Error {}

export function validateProfile(input: ProfileFields): ProfileFields {
  const displayName = input.displayName.trim()
  if (!displayName) throw new ProfileDataError('Enter your name')
  if (displayName.length > 80) throw new ProfileDataError('Name cannot exceed 80 characters')
  if (!profileGoals.some(goal => goal.value === input.primaryGoal)
    || !Number.isInteger(input.weeklyGoal) || input.weeklyGoal < 1 || input.weeklyGoal > 14
    || (input.units !== 'kg' && input.units !== 'lbs')) throw new ProfileDataError('Check your profile preferences.')
  return { displayName, primaryGoal: input.primaryGoal, weeklyGoal: input.weeklyGoal, units: input.units }
}

export function parseProfile(uid: string, value: unknown): NativeProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProfileDataError('The profile data is invalid.')
  const data = value as NativeProfile & { userId?: unknown }
  if ((data.userId !== undefined && data.userId !== uid) || typeof data.displayName !== 'string'
    || !Number.isSafeInteger(data.createdAt) || data.createdAt < 0) throw new ProfileDataError('The profile data is invalid.')
  return { ...validateProfile(data), createdAt: data.createdAt }
}

// An update patch deliberately omits createdAt and any unrelated server fields.
export async function updateExistingProfile(transaction: {
  read: () => Promise<{ exists: boolean; data: unknown }>
  update: (fields: ProfileFields) => void
}, uid: string, input: ProfileFields): Promise<void> {
  const fields = validateProfile(input)
  const snapshot = await transaction.read()
  if (!snapshot.exists) throw new ProfileNotSubmittedError('Profile setup is missing. Return to Home or retry.')
  parseProfile(uid, snapshot.data)
  transaction.update(fields)
}

export function sameProfile(left: ProfileFields, right: ProfileFields): boolean {
  return left.displayName === right.displayName && left.primaryGoal === right.primaryGoal
    && left.weeklyGoal === right.weeklyGoal && left.units === right.units
}

async function bounded<T>(result: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([result, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Could not confirm the profile yet. Check your connection and retry.')), milliseconds)
    })])
  } finally { clearTimeout(timeout) }
}

export type ProfileState = {
  status: 'loading' | 'ready' | 'cached' | 'missing' | 'invalid' | 'error'
  input: ProfileFields | null; baseline: NativeProfile | null
  busy: boolean; pending: boolean; message: string | null; nameError: string | null
}

export class ProfileController {
  state: ProfileState = { status: 'loading', input: null, baseline: null, busy: false, pending: false, message: null, nameError: null }
  private generation = 0
  private alive = true
  private attempt: { fields: ProfileFields; status: 'pending' | 'saved' | 'failed'; result: Promise<void>; error?: unknown } | null = null
  constructor(private readonly uid: string, private readonly dependencies: {
    read: (uid: string, server: boolean) => Promise<{ data: NativeProfile | null; fromCache: boolean }>
    write: (uid: string, fields: ProfileFields) => Promise<void>
    applyUnits: (uid: string, units: Units) => Promise<void>
  }, private readonly publish: (state: ProfileState) => void, private readonly milliseconds = 15_000) {}

  get dirty() { return !!this.state.input && !!this.state.baseline && !sameProfile(this.state.input, this.state.baseline) }
  private set(patch: Partial<ProfileState>) { this.state = { ...this.state, ...patch }; if (this.alive) this.publish(this.state) }
  suspendRead() { this.generation += 1 }
  discard() { if (!this.attempt && !this.state.busy) this.set({ input: this.state.baseline, message: null, nameError: null }) }
  dispose() { this.alive = false; this.generation += 1 }
  change(patch: Partial<ProfileFields>) {
    if (this.state.status !== 'ready' || !this.state.input || this.state.busy || this.attempt) return
    this.generation += 1
    this.set({ input: { ...this.state.input, ...patch }, message: null, nameError: null })
  }
  async load(server = false) {
    if (!this.alive || this.dirty || this.attempt || this.state.busy) return
    const generation = ++this.generation
    this.set({ status: 'loading', message: null })
    try {
      const read = await bounded(this.dependencies.read(this.uid, server), this.milliseconds)
      if (!this.alive || generation !== this.generation) return
      this.set({ status: read.data ? read.fromCache ? 'cached' : 'ready' : read.fromCache ? 'error' : 'missing', input: read.data, baseline: read.data,
        message: read.fromCache ? 'Could not confirm your profile. Reconnect and retry before editing.' : null })
    } catch (error) {
      if (this.alive && generation === this.generation) this.set({ status: error instanceof ProfileDataError ? 'invalid' : 'error', message: error instanceof ProfileDataError ? 'The profile data is invalid. Retry or return to Home.' : 'Could not load your profile. Check your connection and retry.' })
    }
  }
  async save() {
    if (!this.alive || this.state.status !== 'ready' || !this.state.input || this.state.busy) return
    if (this.attempt) return this.reconcile()
    let fields: ProfileFields
    try { fields = validateProfile(this.state.input) }
    catch (error) { this.set({ nameError: error instanceof Error ? error.message : 'Check your profile preferences.' }); return }
    this.generation += 1
    this.set({ busy: true, pending: true, message: null, nameError: null })
    const attempt = { fields, status: 'pending' as 'pending' | 'saved' | 'failed', result: Promise.resolve(), error: undefined as unknown }
    this.attempt = attempt
    attempt.result = Promise.resolve().then(() => this.dependencies.write(this.uid, fields)).then(
      () => { attempt.status = 'saved' }, error => { attempt.status = 'failed'; attempt.error = error })
    try { await bounded(attempt.result, this.milliseconds) } catch { /* The original operation still owns its outcome. */ }
    if (!this.alive) return
    this.set({ busy: false })
    if (attempt.status === 'failed' && this.definiteRejection(attempt.error)) {
      this.attempt = null
      this.set({ pending: false, message: attempt.error instanceof ProfileNotSubmittedError ? attempt.error.message : 'Could not save. Check your connection and try again.' })
      return
    }
    await this.reconcile()
  }
  private definiteRejection(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    return error instanceof ProfileNotSubmittedError || error instanceof ProfileDataError
      || ['permission-denied', 'invalid-argument', 'not-found'].some(value => code.endsWith(value))
  }
  async reconcile() {
    const attempt = this.attempt
    if (!this.alive || !attempt || this.state.busy) return
    this.set({ busy: true, message: null })
    try {
      const read = await bounded(this.dependencies.read(this.uid, true), this.milliseconds)
      if (!this.alive || this.attempt !== attempt) return
      // A pre-commit read cannot release an operation that may still commit later.
      if (read.fromCache || attempt.status === 'pending') throw new Error('Save outcome unresolved. Keep this form open, reconnect and check again.')
      if (!read.data || !sameProfile(read.data, attempt.fields)) {
        this.attempt = null
        this.set({ pending: false, message: 'Changes were not confirmed. Your entered values were kept; review and save again.' })
        return
      }
      await this.dependencies.applyUnits(this.uid, read.data.units)
      if (!this.alive || this.attempt !== attempt) return
      this.attempt = null
      this.set({ input: read.data, baseline: read.data, pending: false, message: 'Profile saved' })
    } catch (error) {
      if (this.alive) this.set({ message: error instanceof Error ? error.message : 'Could not confirm the save. Check again before closing.' })
    } finally { if (this.alive) this.set({ busy: false }) }
  }
}
