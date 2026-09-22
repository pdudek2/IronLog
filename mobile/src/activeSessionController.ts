import {
  addExercise,
  addSet,
  adjustSetValue,
  removeExercise,
  removeSet,
  setLabel,
  setSetDone,
  updateSetValue,
  type SetField,
} from './setMutations'
import {
  type PendingSessionWrite,
  type SessionDraft,
  type TwoSlotSessionJournal,
} from './sessionJournal'
import { createLocalId, parseSessionDocument, type ActiveWorkout, type ExerciseSource, type Units } from './session'

export interface SessionSnapshot {
  exists: boolean
  data: unknown
  fromCache: boolean
  hasPendingWrites: boolean
}

export type SessionSyncStatus = 'saved' | 'local' | 'saving' | 'failed' | 'conflict' | 'storage-error'
export type SessionConflictKind = 'changed' | 'replaced' | 'closed'

export type ActiveSessionState =
  | { status: 'loading'; session: null; units: Units }
  | { status: 'cache-miss'; session: null; units: Units }
  | { status: 'empty'; session: null; units: Units }
  | { status: 'ready'; session: ActiveWorkout; units: Units; stale: boolean; syncStatus: SessionSyncStatus; conflict?: SessionConflictKind }
  | { status: 'error'; session: null; units: Units; message: string }

const INITIAL_SESSION_STATE: ActiveSessionState = { status: 'loading', session: null, units: 'kg' }

export function stateForAccount(
  currentUid: string | null,
  stateOwnerUid: string | null,
  state: ActiveSessionState,
): ActiveSessionState {
  return currentUid === stateOwnerUid ? state : INITIAL_SESSION_STATE
}

export type SubscribeToSession = (
  uid: string,
  onSnapshot: (snapshot: SessionSnapshot) => void,
  onError: (error: unknown) => void,
) => () => void

export type SaveActiveSession = (
  uid: string,
  session: ActiveWorkout,
  expectedRevision: string | null,
  requestRevision: string,
) => Promise<void>

export interface ActiveSessionControllerDependencies {
  subscribe: SubscribeToSession
  readUnits: (uid: string) => Promise<Units>
  save: SaveActiveSession
  createRevision: () => string
  isConflictError: (error: unknown) => boolean
  isTransientError: (error: unknown) => boolean
  journal: TwoSlotSessionJournal
}

function errorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (code.includes('permission-denied')) return 'You no longer have permission to read this session.'
  if (error instanceof Error && error.name === 'SessionDataError') return `The session data is invalid. ${error.message}`
  return 'The active session could not be loaded.'
}

function sameContent(left: ActiveWorkout, right: ActiveWorkout): boolean {
  return left.sessionId === right.sessionId && (left.label ?? '') === (right.label ?? '')
    && JSON.stringify(left.exercises) === JSON.stringify(right.exercises)
}

function reuseStableIds(next: ActiveWorkout, previous: ActiveWorkout | null): ActiveWorkout {
  if (!previous || previous.sessionId !== next.sessionId || previous.sessionRevision !== next.sessionRevision) return next
  return {
    ...next,
    exercises: next.exercises.map((exercise, exerciseIndex) => {
      const prior = previous.exercises[exerciseIndex]
      if (!prior || prior.exerciseId !== exercise.exerciseId || prior.exerciseSource !== exercise.exerciseSource) return exercise
      return {
        ...exercise,
        clientId: prior.clientId,
        sets: exercise.sets.map((set, setIndex) => ({ ...set, clientId: prior.sets[setIndex]?.clientId ?? set.clientId })),
      }
    }),
  }
}

export class ActiveSessionController {
  private generation = 0
  private uid: string | null = null
  private unsubscribe: (() => void) | null = null
  private units: Units = 'kg'
  private unitsReady = false
  private unitsError: unknown = null
  private journalReady = false
  private latestSnapshot: SessionSnapshot | null = null
  private authoritative: ActiveWorkout | null | undefined
  private cachedSession: ActiveWorkout | null = null
  private draft: SessionDraft | null = null
  private conflict: SessionConflictKind | null = null
  private failed = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private saveAttempt = 0
  private saveToken = 0
  private inFlightRevision: string | null = null
  private completedRevision: string | null = null
  private blockedRevision: string | null = null
  private transitionQueue = Promise.resolve()
  private readonly journal: TwoSlotSessionJournal

  constructor(
    private readonly dependencies: ActiveSessionControllerDependencies,
    private readonly onState: (state: ActiveSessionState) => void,
  ) {
    this.journal = dependencies.journal
  }

  start(uid: string): void {
    this.resetRuntime()
    this.uid = uid
    const generation = ++this.generation
    this.onState({ status: 'loading', session: null, units: this.units })

    void this.journal.load(uid).then((result) => this.enqueue(async () => {
        if (!this.isCurrent(uid, generation)) return
        if (result.status === 'corrupt') {
          this.stopListener()
          this.onState({ status: 'error', session: null, units: this.units, message: 'The saved workout draft is damaged. Its files were preserved for recovery.' })
          this.generation += 1
          return
        }
        this.journalReady = true
        if (result.status === 'empty' && this.unitsError) {
          this.fail(uid, generation, this.unitsError)
          return
        }
        if (result.status === 'draft') {
          this.draft = result.draft
          this.units = result.draft.units
          this.unitsReady = true
          this.emitDraft(result.draft.pending ? 'saving' : 'local', true)
        }
        this.queueSnapshot(uid, generation)
      }), () => this.enqueue(async () => {
        if (this.isCurrent(uid, generation)) {
          this.stopListener()
          this.onState({ status: 'error', session: null, units: this.units, message: 'The saved workout draft could not be opened.' })
          this.generation += 1
        }
      }))

    void this.dependencies.readUnits(uid).then((units) => this.enqueue(async () => {
        if (!this.isCurrent(uid, generation)) return
        if (!this.draft) this.units = units
        this.unitsReady = true
        this.queueSnapshot(uid, generation)
      }), (error) => this.enqueue(async () => {
        if (!this.isCurrent(uid, generation)) return
        this.unitsError = error
        if (!this.journalReady || this.draft) return
        this.fail(uid, generation, error)
      }))

    this.unsubscribe = this.dependencies.subscribe(
      uid,
      (snapshot) => {
        if (!this.isCurrent(uid, generation)) return
        this.latestSnapshot = snapshot
        this.queueSnapshot(uid, generation)
      },
      (error) => this.enqueue(async () => this.fail(uid, generation, error)),
    )
  }

  retry(): void {
    if (this.uid) this.start(this.uid)
  }

  retrySave(): void {
    const uid = this.uid
    const generation = this.generation
    if (!uid) return
    if (this.authoritative === undefined) {
      this.start(uid)
      return
    }
    this.enqueue(async () => {
      if (!this.isCurrent(uid, generation) || !this.draft || this.conflict) return
      this.saveAttempt = 0
      this.blockedRevision = null
      this.failed = false
      if (this.draft.pending) this.dispatchPending(uid, generation, this.draft.pending)
      else this.scheduleSave(0)
    })
  }

  discardLocalChanges(): void {
    const uid = this.uid
    const generation = this.generation
    if (!uid || !this.draft || !this.conflict || this.authoritative === undefined) return
    this.enqueue(async () => {
      if (!this.isCurrent(uid, generation) || !this.draft || !this.conflict || this.authoritative === undefined) return
      try {
        await this.journal.clear(uid)
      } catch {
        if (this.isCurrent(uid, generation)) this.emitDraft('storage-error', false)
        return
      }
      if (!this.isCurrent(uid, generation)) return
      this.draft = null
      this.conflict = null
      this.failed = false
      this.cancelSave()
      this.saveToken += 1
      this.inFlightRevision = null
      this.completedRevision = null
      this.blockedRevision = null
      if (this.authoritative) this.emitReady(this.authoritative, false, 'saved')
      else this.onState({ status: 'empty', session: null, units: this.units })
    })
  }

  updateSet(exerciseId: string, setId: string, field: SetField, value: string): void {
    this.mutate((session) => updateSetValue(session, exerciseId, setId, field, value))
  }

  adjustSet(exerciseId: string, setId: string, field: SetField, delta: number): void {
    this.mutate((session) => adjustSetValue(session, exerciseId, setId, field, delta))
  }

  setDone(exerciseId: string, setId: string, done: boolean): void {
    this.mutate((session) => setSetDone(session, exerciseId, setId, done))
  }

  addSet(exerciseId: string): void {
    this.mutate((session) => addSet(session, exerciseId))
  }

  removeSet(exerciseId: string, setId: string): void {
    this.mutate((session) => removeSet(session, exerciseId, setId))
  }

  /** Returns the new exercise's client id so the caller can focus it once the draft publishes. */
  addExercise(exerciseId: string, name: string, exerciseSource: ExerciseSource): string {
    const clientId = createLocalId('exercise')
    this.mutate((session) => addExercise(session, { clientId, exerciseId, exerciseSource, name }))
    return clientId
  }

  removeExercise(exerciseId: string): void {
    this.mutate((session) => removeExercise(session, exerciseId))
  }

  setLabel(label: string): void {
    this.mutate((session) => setLabel(session, label))
  }

  clear(): void {
    this.resetRuntime()
    this.uid = null
    this.generation += 1
  }

  dispose(): void {
    this.clear()
  }

  private mutate(change: (session: ActiveWorkout) => ActiveWorkout): void {
    const uid = this.uid
    const generation = this.generation
    if (!uid) return
    this.enqueue(async () => {
      if (!this.isCurrent(uid, generation) || !this.journalReady) return
      const current = this.draft?.session ?? this.authoritative ?? this.cachedSession
      if (!current) return
      const next = change(current)
      if (sameContent(current, next)) return
      const draft: SessionDraft = {
        session: next,
        units: this.units,
        baseRevision: this.draft?.baseRevision ?? current.sessionRevision,
        pending: this.draft?.pending ?? null,
      }
      try {
        await this.journal.writeDraft(uid, draft)
      } catch {
        if (this.isCurrent(uid, generation)) {
          if (this.draft) this.emitDraft('storage-error', this.authoritative === undefined)
          else this.emitReady(current, this.authoritative === undefined, 'storage-error')
        }
        return
      }
      if (!this.isCurrent(uid, generation)) return
      this.draft = draft
      this.emitDraft(this.conflict ? 'conflict' : 'local', this.authoritative === undefined)
      if (!this.conflict) this.scheduleSave(400)
    })
  }

  private queueSnapshot(uid: string, generation: number): void {
    this.enqueue(async () => {
      if (!this.journalReady || !this.unitsReady || !this.latestSnapshot || !this.isCurrent(uid, generation)) return
      const snapshot = this.latestSnapshot
      let remote: ActiveWorkout | null = null
      try {
        remote = snapshot.exists
          ? reuseStableIds(parseSessionDocument(uid, snapshot.data), this.draft?.session ?? this.authoritative ?? this.cachedSession)
          : null
      } catch (error) {
        if (snapshot.fromCache || snapshot.hasPendingWrites) {
          if (!this.draft) this.onState({ status: 'error', session: null, units: this.units, message: errorMessage(error) })
          return
        }
        this.fail(uid, generation, error)
        return
      }

      if (snapshot.fromCache || snapshot.hasPendingWrites) {
        if (this.draft) this.emitDraft(this.draft.pending ? 'saving' : 'local', true)
        else if (remote) {
          this.cachedSession = remote
          this.emitReady(remote, true, 'saved')
        }
        else this.onState({ status: 'cache-miss', session: null, units: this.units })
        return
      }

      this.authoritative = remote
      this.cachedSession = remote
      if (!this.draft) {
        if (remote) this.emitReady(remote, false, 'saved')
        else this.onState({ status: 'empty', session: null, units: this.units })
        return
      }
      await this.reconcileDraft(uid, generation, remote)
    })
  }

  private async reconcileDraft(uid: string, generation: number, remote: ActiveWorkout | null): Promise<void> {
    const draft = this.draft
    if (!draft || !this.isCurrent(uid, generation)) return
    if (!remote) return this.setConflict('closed')
    if (remote.sessionId !== draft.session.sessionId) return this.setConflict('replaced')
    const revision = remote.sessionRevision

    if (draft.pending) {
      if (revision === draft.pending.requestRevision) {
        this.conflict = null
        this.failed = false
        if (sameContent(draft.session, draft.pending.snapshot)) {
          try {
            await this.journal.clear(uid)
          } catch {
            if (this.isCurrent(uid, generation)) this.emitDraft('storage-error', false)
            return
          }
          if (!this.isCurrent(uid, generation)) return
          this.draft = null
          this.inFlightRevision = null
          this.completedRevision = null
          this.blockedRevision = null
          this.saveToken += 1
          this.emitReady(remote, false, 'saved')
          return
        }
        const rebased: SessionDraft = {
          ...draft,
          session: { ...draft.session, sessionRevision: revision },
          baseRevision: revision,
          pending: null,
        }
        try {
          await this.journal.writeDraft(uid, rebased)
        } catch {
          if (this.isCurrent(uid, generation)) this.emitDraft('storage-error', false)
          return
        }
        if (!this.isCurrent(uid, generation)) return
        this.draft = rebased
        this.inFlightRevision = null
        this.completedRevision = null
        this.blockedRevision = null
        this.saveToken += 1
        this.emitDraft('local', false)
        this.scheduleSave(0)
        return
      }
      if (revision === draft.pending.expectedRevision) {
        this.emitDraft('saving', false)
        if (this.completedRevision !== draft.pending.requestRevision) this.dispatchPending(uid, generation, draft.pending)
        return
      }
      this.setConflict('changed')
      return
    }

    if (revision !== draft.baseRevision) return this.setConflict('changed')
    if (sameContent(draft.session, remote)) {
      try {
        await this.journal.clear(uid)
      } catch {
        if (this.isCurrent(uid, generation)) this.emitDraft('storage-error', false)
        return
      }
      if (!this.isCurrent(uid, generation)) return
      this.draft = null
      this.inFlightRevision = null
      this.completedRevision = null
      this.blockedRevision = null
      this.failed = false
      this.emitReady(remote, false, 'saved')
      return
    }
    this.emitDraft('local', false)
    this.scheduleSave(0)
  }

  private scheduleSave(delay: number): void {
    this.cancelSave()
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.enqueue(() => this.prepareSave())
    }, delay)
  }

  private async prepareSave(): Promise<void> {
    const uid = this.uid
    const generation = this.generation
    const draft = this.draft
    if (!uid || !draft || draft.pending || this.conflict || this.authoritative === undefined) return
    const pending: PendingSessionWrite = {
      expectedRevision: draft.baseRevision,
      requestRevision: this.dependencies.createRevision(),
      snapshot: draft.session,
    }
    const pendingDraft = { ...draft, pending }
    try {
      await this.journal.writeDraft(uid, pendingDraft)
    } catch {
      if (this.isCurrent(uid, generation)) this.emitDraft('storage-error', false)
      return
    }
    if (!this.isCurrent(uid, generation)) return
    this.draft = pendingDraft
    this.saveAttempt = 0
    this.emitDraft('saving', false)
    this.dispatchPending(uid, generation, pending)
  }

  private dispatchPending(uid: string, generation: number, pending: PendingSessionWrite): void {
    if (!this.isCurrent(uid, generation) || this.conflict
      || this.draft?.pending?.requestRevision !== pending.requestRevision
      || this.inFlightRevision === pending.requestRevision
      || this.completedRevision === pending.requestRevision
      || this.blockedRevision === pending.requestRevision) return
    const token = ++this.saveToken
    this.inFlightRevision = pending.requestRevision
    this.saveAttempt += 1
    void this.dependencies.save(uid, pending.snapshot, pending.expectedRevision, pending.requestRevision).then(() => this.enqueue(async () => {
      if (!this.isCurrent(uid, generation) || token !== this.saveToken) return
      this.inFlightRevision = null
      this.completedRevision = pending.requestRevision
      this.emitDraft('saving', false)
    }), (error) => this.enqueue(async () => {
      if (!this.isCurrent(uid, generation) || token !== this.saveToken
        || this.draft?.pending?.requestRevision !== pending.requestRevision) return
      this.inFlightRevision = null
      if (this.dependencies.isConflictError(error)) {
        this.setConflict('changed')
      } else if (this.dependencies.isTransientError(error) && this.saveAttempt < 3) {
        this.emitDraft('saving', false)
        this.scheduleRetry(uid, generation, pending, 300 * this.saveAttempt)
      } else {
        this.blockedRevision = pending.requestRevision
        this.failed = true
        this.emitDraft('failed', false)
      }
    }))
  }

  private scheduleRetry(uid: string, generation: number, pending: PendingSessionWrite, delay: number): void {
    this.cancelSave()
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.enqueue(async () => this.dispatchPending(uid, generation, pending))
    }, delay)
  }

  private setConflict(kind: SessionConflictKind): void {
    this.conflict = kind
    this.cancelSave()
    this.saveToken += 1
    this.inFlightRevision = null
    this.emitDraft('conflict', false)
  }

  private emitDraft(syncStatus: SessionSyncStatus, stale: boolean): void {
    if (!this.draft) return
    const effectiveStatus = this.conflict ? 'conflict' : this.failed ? 'failed' : syncStatus
    this.onState({
      status: 'ready',
      session: this.draft.session,
      units: this.draft.units,
      stale,
      syncStatus: effectiveStatus,
      ...(this.conflict ? { conflict: this.conflict } : {}),
    })
  }

  private emitReady(session: ActiveWorkout, stale: boolean, syncStatus: SessionSyncStatus): void {
    this.onState({ status: 'ready', session, units: this.units, stale, syncStatus })
  }

  private resetRuntime(): void {
    this.stopListener()
    this.cancelSave()
    this.saveToken += 1
    this.units = 'kg'
    this.unitsReady = false
    this.unitsError = null
    this.journalReady = false
    this.latestSnapshot = null
    this.authoritative = undefined
    this.cachedSession = null
    this.draft = null
    this.conflict = null
    this.failed = false
    this.saveAttempt = 0
    this.inFlightRevision = null
    this.completedRevision = null
    this.blockedRevision = null
  }

  private enqueue(task: () => void | Promise<void>): void {
    this.transitionQueue = this.transitionQueue.then(task, task).catch((error) => {
      console.error('[active session transition error]', error)
    })
  }

  private cancelSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
  }

  private stopListener(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private isCurrent(uid: string, generation: number): boolean {
    return this.uid === uid && this.generation === generation
  }

  private fail(uid: string, generation: number, error: unknown): void {
    if (!this.isCurrent(uid, generation)) return
    if (this.draft) {
      this.authoritative = undefined
      this.stopListener()
      this.cancelSave()
      this.saveToken += 1
      this.inFlightRevision = null
      this.blockedRevision = this.draft.pending?.requestRevision ?? null
      this.failed = true
      this.emitDraft('failed', true)
      return
    }
    this.stopListener()
    this.latestSnapshot = null
    this.generation += 1
    this.onState({ status: 'error', session: null, units: this.units, message: errorMessage(error) })
  }
}
