import type { LaunchAttempt, LaunchJournal, ReplacementIdentity } from './launchJournal'
import type { ActiveWorkout, ExerciseSource } from './session'
import type { TemplateExerciseOverrideMap } from '../../src/shared/nextSessionRecommendation'
import {
  buildTemplateSession, selectionFingerprint, TargetUnavailableError,
  type BestSet, type LaunchResult, type WorkoutSelection, type WorkoutTemplate,
} from './workoutLaunch'

export class ReplacementRejectedError extends Error {}

export type LaunchState = { replacing?: boolean; status: 'loading' | 'ready' | 'starting' | 'retry' | 'unavailable' | 'corrupt'; message?: string; selection?: WorkoutSelection }
export type LaunchTarget = ({ kind: 'empty' } | { kind: 'template'; selection: WorkoutSelection; snapshot: WorkoutTemplate; overrides?: TemplateExerciseOverrideMap }) & { replaces?: ReplacementIdentity }
export interface LaunchPort {
  replace?(uid: string, attempt: LaunchAttempt): Promise<void>
  readActive(uid: string): Promise<ActiveWorkout | null>
  isClosed(uid: string, sessionId: string): Promise<boolean>
  claim(uid: string, candidate: ActiveWorkout): Promise<LaunchResult>
  readTemplate(uid: string, id: string): Promise<WorkoutTemplate | null>
  readBest(uid: string, id: string, source: ExerciseSource): Promise<BestSet | null>
  createId(): string
  now(): number
}

export class WorkoutLaunchController {
  private attempt: LaunchAttempt | null = null
  private busy = false
  private disposed = false
  private loaded = false
  private lastTarget: LaunchTarget | null = null
  private observed: ActiveWorkout | null = null
  private selection?: WorkoutSelection

  constructor(
    private uid: string,
    private journal: LaunchJournal,
    private port: LaunchPort,
    private publish: (state: LaunchState) => void,
    private onResult: (result: LaunchResult) => void,
  ) {}

  dispose() { this.disposed = true }
  private emit(state: LaunchState) { if (!this.disposed) this.publish({ replacing: !!this.attempt?.replaces, ...state, ...(state.status !== 'ready' && this.selection ? { selection: this.selection } : {}) }) }

  async load(): Promise<void> {
    if (this.busy || this.loaded) return
    this.busy = true
    this.emit({ status: 'loading' })
    try {
      this.attempt = await this.journal.load(this.uid)
      if (this.disposed) return
      this.selection = this.attempt?.selection
      this.loaded = true
      if (this.attempt) await this.reconcile()
      else this.emit({ status: 'ready' })
    } catch (error) {
      this.emit({ status: 'corrupt', message: error instanceof Error ? error.message : 'Could not open the saved start attempt.' })
    } finally { this.finishBusy() }
  }

  async launch(target: LaunchTarget, canStart: () => boolean): Promise<void> {
    if (this.busy || this.disposed || !this.loaded || (!this.attempt && !canStart())) return
    if (target.kind === 'template' && target.overrides) target = { ...target, overrides: new Map([...target.overrides].map(([key, value]) => [key, { ...value }])) }
    this.busy = true
    if (!this.attempt) this.selection = target.kind === 'template' ? target.selection : undefined
    this.lastTarget = target
    this.emit({ status: 'starting' })
    try {
      const pending = !!this.attempt
      if (pending && await this.reconcile(true) !== 'open') return
      if (!this.attempt) {
        let next: LaunchAttempt
        if (target.kind === 'empty') {
          next = { candidate: {
            sessionId: this.port.createId(), sessionRevision: this.port.createId(), startedAt: this.port.now(),
            templateId: null, exercises: [],
          } }
        } else {
          const { templateId, dayIndex } = target.selection
          const fresh = await this.port.readTemplate(this.uid, templateId)
          if (this.disposed) return
          if (!fresh || fresh.userId !== this.uid || !fresh.days[dayIndex]?.exercises.length
            || selectionFingerprint(fresh, dayIndex) !== selectionFingerprint(target.snapshot, dayIndex)) throw new TargetUnavailableError()
          const unique = new Map(fresh.days[dayIndex]!.exercises.map((exercise) => [`${exercise.exerciseSource}:${exercise.exerciseId}`, exercise]))
          const entries = target.overrides ? [] : await Promise.all([...unique].map(async ([key, exercise]) => {
            try { return [key, await this.port.readBest(this.uid, exercise.exerciseId, exercise.exerciseSource)] as const }
            catch { return [key, null] as const }
          }))
          if (this.disposed) return
          const history = new Map(entries.filter((entry): entry is readonly [string, BestSet] => entry[1] !== null))
          next = {
            candidate: buildTemplateSession(fresh, dayIndex, history, this.port.createId(), this.port.createId(), this.port.now(), target.overrides),
            selection: { templateId, dayIndex, fingerprint: selectionFingerprint(fresh, dayIndex) },
          }
        }
        if (target.replaces) {
          if (target.kind !== 'template' || !this.port.replace) throw new Error('Replacement unavailable.')
          next.replaces = { ...target.replaces }
        }
        await this.journal.save(this.uid, next)
        this.attempt = next
        this.emit({ status: 'starting' })
      }
      if (this.disposed) return
      if (!pending && !this.attempt.replaces) {
        const remote = await this.port.readActive(this.uid)
        if (this.disposed) return
        if (remote) { await this.confirm({ kind: remote.sessionId === this.attempt.candidate.sessionId ? 'started' : 'existing', session: remote }); return }
      }
      if (this.attempt.selection) {
        const { templateId, dayIndex, fingerprint } = this.attempt.selection
        const fresh = await this.port.readTemplate(this.uid, templateId)
        if (this.disposed) return
        if (!fresh || !fresh.days[dayIndex]?.exercises.length || selectionFingerprint(fresh, dayIndex) !== fingerprint) {
          if (!await this.journal.clearIfMatches(this.uid, this.attempt.candidate.sessionId)) return
          if (this.disposed) return
          this.attempt = null
          throw new TargetUnavailableError()
        }
      }
      if (!canStart() || this.disposed) {
        this.emit({ status: 'retry', message: 'Checking the current workout before starting. Try again.' })
        return
      }
      try {
        if (this.attempt.replaces) {
          await this.port.replace!(this.uid, this.attempt)
          await this.reconcile()
        } else await this.confirm(await this.port.claim(this.uid, this.attempt.candidate))
      } catch (error) {
        if (error instanceof ReplacementRejectedError && this.attempt) {
          if (!await this.journal.clearIfMatches(this.uid, this.attempt.candidate.sessionId) || this.disposed) return
          this.attempt = null; this.lastTarget = null
          this.emit({ status: 'unavailable', message: error.message })
        } else await this.reconcile()
      }
    } catch (error) {
      if (this.disposed) return
      if (error instanceof TargetUnavailableError) this.emit({ status: 'unavailable', message: error.message })
      else this.emit({ status: 'retry', message: 'Could not confirm the workout start. Reconnect and try again.' })
    } finally { this.finishBusy() }
  }

  async retry(canStart: () => boolean): Promise<void> {
    if (!this.attempt && !this.lastTarget) return this.load()
    return this.launch(this.attempt ? { kind: 'empty' } : this.lastTarget!, canStart)
  }

  dismissUnavailable(): void {
    if (this.busy || this.attempt) return
    this.lastTarget = null
    this.emit({ status: 'ready' })
  }

  async recover(): Promise<void> {
    if (this.busy || this.disposed || !this.loaded || !this.attempt) return
    this.busy = true
    try { await this.reconcile() }
    finally { this.finishBusy() }
  }

  async observeActive(session: ActiveWorkout): Promise<void> {
    if (this.disposed || !this.loaded || !this.attempt) return
    if (session.sessionId === this.attempt.replaces?.sessionId) return
    if (this.busy) { this.observed = session; return }
    this.busy = true
    try { await this.confirm({ kind: session.sessionId === this.attempt.candidate.sessionId ? 'started' : 'existing', session }) }
    finally { this.finishBusy() }
  }

  private finishBusy(): void {
    this.busy = false
    const session = this.observed
    this.observed = null
    if (session && !this.disposed) void this.observeActive(session)
  }

  private async reconcile(silentOpen = false): Promise<'active' | 'closed' | 'open' | 'unknown'> {
    const attempt = this.attempt
    if (!attempt || this.disposed) return 'unknown'
    try {
      const remote = await this.port.readActive(this.uid)
      if (this.disposed || this.attempt !== attempt) return 'unknown'
      if (remote && remote.sessionId === attempt.replaces?.sessionId) {
        if (!silentOpen) this.emit({ status: 'retry', message: 'Replacement needs confirmation. Check the outcome before editing this workout.' })
        return 'open'
      }
      if (remote) {
        await this.confirm({ kind: remote.sessionId === attempt.candidate.sessionId ? 'started' : 'existing', session: remote })
        return 'active'
      }
      const closed = await this.port.isClosed(this.uid, attempt.candidate.sessionId)
      if (this.disposed || this.attempt !== attempt) return 'unknown'
      if (closed) {
        if (!await this.journal.clearIfMatches(this.uid, attempt.candidate.sessionId)) return 'unknown'
        if (this.disposed) return 'unknown'
        this.attempt = null
        this.emit({ status: 'ready' })
        return 'closed'
      }
      if (!silentOpen) this.emit({ status: 'retry', message: 'The saved start is ready to retry.' })
      return 'open'
    } catch { /* The attempt stays durable until the server can confirm its outcome. */ }
    this.emit({ status: 'retry', message: 'Could not confirm the workout start. Reconnect and try again.' })
    return 'unknown'
  }

  private async confirm(result: LaunchResult): Promise<void> {
    if (this.disposed || !this.attempt) return
    let cleared: boolean | null = null
    try { cleared = await this.journal.clearIfMatches(this.uid, this.attempt.candidate.sessionId) }
    catch { /* Keep the candidate durable for closure recovery. */ }
    if (this.disposed || cleared === false) return
    if (cleared) this.attempt = null
    this.emit(cleared ? { status: 'ready' } : { status: 'retry', message: 'Workout started. Its start record still needs recovery.' })
    this.onResult(result)
  }
}
