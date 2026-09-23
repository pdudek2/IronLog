import type { LaunchAttempt, LaunchJournal } from './launchJournal'
import type { ActiveWorkout, ExerciseSource } from './session'
import {
  buildTemplateSession, selectionFingerprint, TargetUnavailableError,
  type BestSet, type LaunchResult, type WorkoutSelection, type WorkoutTemplate,
} from './workoutLaunch'

export type LaunchState = { status: 'loading' | 'ready' | 'starting' | 'retry' | 'unavailable' | 'corrupt'; message?: string }
export type LaunchTarget = { kind: 'empty' } | { kind: 'template'; selection: WorkoutSelection; snapshot: WorkoutTemplate }
export interface LaunchPort {
  readActive(uid: string): Promise<ActiveWorkout | null>
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

  constructor(
    private uid: string,
    private journal: LaunchJournal,
    private port: LaunchPort,
    private publish: (state: LaunchState) => void,
    private onResult: (result: LaunchResult) => void,
  ) {}

  dispose() { this.disposed = true }
  private emit(state: LaunchState) { if (!this.disposed) this.publish(state) }

  async load(): Promise<void> {
    if (this.busy || this.loaded) return
    this.busy = true
    this.emit({ status: 'loading' })
    try {
      this.attempt = await this.journal.load(this.uid)
      if (this.disposed) return
      this.loaded = true
      if (this.attempt) await this.reconcile()
      else this.emit({ status: 'ready' })
    } catch (error) {
      this.emit({ status: 'corrupt', message: error instanceof Error ? error.message : 'Could not open the saved start attempt.' })
    } finally { this.busy = false }
  }

  async launch(target: LaunchTarget, canStart: () => boolean): Promise<void> {
    if (this.busy || this.disposed || !this.loaded || !canStart()) return
    this.busy = true
    this.lastTarget = target
    this.emit({ status: 'starting' })
    try {
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
          const entries = await Promise.all([...unique].map(async ([key, exercise]) => {
            try { return [key, await this.port.readBest(this.uid, exercise.exerciseId, exercise.exerciseSource)] as const }
            catch { return [key, null] as const }
          }))
          if (this.disposed) return
          const history = new Map(entries.filter((entry): entry is readonly [string, BestSet] => entry[1] !== null))
          next = {
            candidate: buildTemplateSession(fresh, dayIndex, history, this.port.createId(), this.port.createId(), this.port.now()),
            selection: { templateId, dayIndex, fingerprint: selectionFingerprint(fresh, dayIndex) },
          }
        }
        await this.journal.save(this.uid, next)
        this.attempt = next
      }
      if (this.disposed) return
      const remote = await this.port.readActive(this.uid)
      if (remote) { await this.confirm({ kind: remote.sessionId === this.attempt.candidate.sessionId ? 'started' : 'existing', session: remote }); return }
      if (this.attempt.selection) {
        const { templateId, dayIndex, fingerprint } = this.attempt.selection
        const fresh = await this.port.readTemplate(this.uid, templateId)
        if (!fresh || !fresh.days[dayIndex]?.exercises.length || selectionFingerprint(fresh, dayIndex) !== fingerprint) {
          await this.journal.save(this.uid, null)
          this.attempt = null
          throw new TargetUnavailableError()
        }
      }
      if (!canStart() || this.disposed) {
        this.emit({ status: 'retry', message: 'Checking the current workout before starting. Try again.' })
        return
      }
      try { await this.confirm(await this.port.claim(this.uid, this.attempt.candidate)) }
      catch { await this.reconcile() }
    } catch (error) {
      if (this.disposed) return
      if (error instanceof TargetUnavailableError) this.emit({ status: 'unavailable', message: error.message })
      else this.emit({ status: 'retry', message: 'Could not confirm the workout start. Reconnect and try again.' })
    } finally { this.busy = false }
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

  private async reconcile(): Promise<void> {
    if (!this.attempt) return
    try {
      const remote = await this.port.readActive(this.uid)
      if (remote) { await this.confirm({ kind: remote.sessionId === this.attempt.candidate.sessionId ? 'started' : 'existing', session: remote }); return }
    } catch { /* The attempt stays durable until the server can confirm its outcome. */ }
    this.emit({ status: 'retry', message: 'Could not confirm the workout start. Reconnect and try again.' })
  }

  private async confirm(result: LaunchResult): Promise<void> {
    try { await this.journal.save(this.uid, null); this.attempt = null }
    catch { /* Reconcile the same candidate again after restart; never create a second one. */ }
    if (this.disposed) return
    this.emit({ status: 'ready' })
    this.onResult(result)
  }
}
