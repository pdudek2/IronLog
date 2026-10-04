import type { WorkoutMutationState } from '../../src/shared/workoutMutation'
import type { WeightUnits } from '../../src/shared/weightUnits'
import { newWorkoutDraft, normalizeWorkoutDraft, workoutDraftDirty, type WorkoutDraft, type WorkoutPendingOperation } from './workoutEditor'
import type { WorkoutEditorJournal } from './workoutEditorJournal'
interface Dependencies {
  uid: string; workoutId: string; owner: string; units: WeightUnits; newId: () => string; journal: WorkoutEditorJournal
  read(operationId?: string): Promise<WorkoutMutationState>
  send(operation: WorkoutPendingOperation): Promise<void>
}
export interface WorkoutEditorState {
  draft: WorkoutDraft | null; busy: boolean; error: string | null; storageFailed: boolean
  phase: 'loading' | 'editing' | 'unknown' | 'pending' | 'conflict' | 'complete' | 'gone'
}
export class WorkoutEditorController {
  state: WorkoutEditorState = { draft: null, busy: false, error: null, storageFailed: false, phase: 'loading' }
  private alive = true
  private openEpoch = 0
  private writes: Promise<void> = Promise.resolve()
  private listeners = new Set<() => void>()
  constructor(private deps: Dependencies) {}
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  snapshot = () => this.state
  dispose() { this.alive = false; this.openEpoch++; this.listeners.clear() }
  private publish(patch: Partial<WorkoutEditorState>) { if (this.alive) { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn() } }
  private error(error: unknown) { this.publish({ error: error instanceof Error ? error.message : 'Could not confirm the change.' }) }
  async open(): Promise<void> {
    this.alive = true
    const epoch = ++this.openEpoch
    const current = () => this.alive && this.openEpoch === epoch
    this.publish({ busy: true, error: null })
    try {
      const d = this.deps
      const existing = await d.journal.open(d.uid, d.workoutId, d.owner)
      if (!current()) return
      if (existing) { this.publish({ draft: existing, phase: existing.pending ? 'unknown' : 'editing' }); return }
      const state = await d.read()
      if (!current()) return
      if (!state.workout || !state.baseline) { this.publish({ phase: 'gone' }); return }
      const draft = newWorkoutDraft(state.workout, state.baseline, d.units, d.newId)
      if (!await d.journal.save(d.uid, d.owner, draft, null)) throw new Error('Another editor opened this workout. Reopen it.')
      if (current()) this.publish({ draft, phase: 'editing' })
    } catch (error) { if (current()) this.error(error) }
    finally { if (current()) this.publish({ busy: false }) }
  }
  private persist(next: WorkoutDraft): Promise<void> {
    const previous = this.state.draft!
    const draft = { ...next, revision: previous.revision + 1 }
    this.publish({ draft })
    const write = this.writes.catch(() => undefined).then(async () => {
      const d = this.deps
      try {
        if (!await d.journal.save(d.uid, d.owner, draft, previous.revision)) throw new Error('Another editor owns this draft. Reopen it.')
        this.publish({ storageFailed: false })
      } catch (error) { this.publish({ storageFailed: true }); this.error(error); throw error }
    })
    this.writes = write
    return write
  }
  async change(edit: (draft: WorkoutDraft) => WorkoutDraft): Promise<void> {
    if (!this.alive || !this.state.draft || this.state.draft.pending || this.state.busy) return
    try { await this.persist(edit(this.state.draft)); this.publish({ error: null }) } catch { /* preserve edited fields and expose storage failure */ }
  }
  async flush(): Promise<boolean> {
    try { await this.writes; return !this.state.storageFailed } catch { return false }
  }
  async retryStorage(): Promise<void> {
    if (!this.state.draft || this.state.busy) return
    try { await this.persist(this.state.draft); this.publish({ error: null }) } catch { /* state retains the failure */ }
  }
  private async current(): Promise<boolean> {
    const d = this.deps, draft = this.state.draft
    if (!this.alive || !draft) return false
    const owned = await d.journal.owns(d.uid, d.workoutId, d.owner, draft)
    if (!this.alive) return false
    if (!owned) throw new Error('Another editor owns this draft. Leave and reopen it.')
    return true
  }
  private async complete(phase: 'complete' | 'gone'): Promise<void> {
    const d = this.deps
    if (!this.alive || !this.state.draft) return
    if (!await d.journal.clear(d.uid, d.workoutId, d.owner, this.state.draft)) throw new Error('A newer local draft was kept. Reopen this workout.')
    this.publish({ phase, error: null })
  }
  async discard(): Promise<boolean> {
    if (this.state.busy || (this.state.draft?.pending && this.state.phase !== 'conflict')) return false
    try { await this.writes.catch(() => undefined); await this.complete('complete'); return this.state.phase === 'complete' }
    catch (error) { this.error(error); return false }
  }
  async submit(action: 'update' | 'delete'): Promise<void> {
    if (!this.alive || !this.state.draft || this.state.busy || this.state.phase === 'conflict') return
    this.publish({ busy: true, error: null })
    try {
      if (!await this.flush()) throw new Error('Draft storage failed. Retry saving it on this device first.')
      if (!await this.current()) return
      let draft = this.state.draft!
      if (!draft.pending) {
        if (action === 'update' && !workoutDraftDirty(draft)) { await this.complete('complete'); return }
        const guard = { workoutId: draft.workoutId, baseline: draft.baseline, operationId: this.deps.newId() }
        const pending: WorkoutPendingOperation = action === 'delete' ? { ...guard, action } : { ...guard, action, content: normalizeWorkoutDraft(draft) }
        await this.persist({ ...draft, pending }); draft = this.state.draft!
      }
      const pending = draft.pending!
      let state = await this.deps.read(pending.operationId)
      if (!await this.current()) return
      if (state.operation?.status === 'superseded' || (pending.action === 'update' && state.status === 'gone')
        || (!state.operation && state.baseline !== pending.baseline)) {
        this.publish({ phase: 'conflict', error: state.status === 'gone' ? 'This workout was deleted. Your draft was kept.' : 'Workout changed elsewhere. Your draft was kept. Discard it to load the latest version.' }); return
      }
      if (state.operation?.status !== 'complete') {
        // The explicit Retry resumes this immutable operation, never a fresh content mutation.
        await this.deps.send(pending)
        if (!await this.current()) return
        state = await this.deps.read(pending.operationId)
        if (!await this.current()) return
      }
      if (state.operation?.status === 'complete') await this.complete(pending.action === 'delete' ? 'gone' : 'complete')
      else if (state.operation?.status === 'superseded') this.publish({ phase: 'conflict', error: 'A newer change replaced this operation. Your draft was kept.' })
      else {
        if (state.operation?.status === 'committed') await this.persist({ ...this.state.draft!, pending: { ...pending, committed: true } })
        this.publish({ phase: 'pending', error: pending.action === 'delete' ? 'Workout deleted. Stats cleanup is still pending.' : 'Workout saved. Stats are still syncing.' })
      }
    } catch (error) {
      if (!this.alive) return
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      this.publish({ phase: ['workout_conflict', 'operation_superseded', 'workout_deleted', 'operation_mismatch'].includes(String(code)) ? 'conflict' : this.state.draft?.pending ? 'unknown' : 'editing' })
      this.error(error)
    } finally { this.publish({ busy: false }) }
  }
}
