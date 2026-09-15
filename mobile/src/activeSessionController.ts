import { parseSessionDocument, type ActiveWorkout, type Units } from './session'

export interface SessionSnapshot {
  exists: boolean
  data: unknown
  fromCache: boolean
  hasPendingWrites: boolean
}

export type ActiveSessionState =
  | { status: 'loading'; session: null; units: Units }
  | { status: 'cache-miss'; session: null; units: Units }
  | { status: 'empty'; session: null; units: Units }
  | { status: 'ready'; session: ActiveWorkout; units: Units; stale: boolean }
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

function errorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : ''
  if (code.includes('permission-denied')) return 'You no longer have permission to read this session.'
  if (error instanceof Error && error.name === 'SessionDataError') return `The session data is invalid. ${error.message}`
  return 'The active session could not be loaded.'
}

export class ActiveSessionController {
  private generation = 0
  private uid: string | null = null
  private unsubscribe: (() => void) | null = null
  private units: Units = 'kg'
  private unitsReady = false
  private latestSnapshot: SessionSnapshot | null = null

  constructor(
    private readonly subscribe: SubscribeToSession,
    private readonly readUnits: (uid: string) => Promise<Units>,
    private readonly onState: (state: ActiveSessionState) => void,
  ) {}

  start(uid: string): void {
    this.stopListener()
    this.uid = uid
    this.units = 'kg'
    this.unitsReady = false
    this.latestSnapshot = null
    const generation = ++this.generation
    this.onState({ status: 'loading', session: null, units: this.units })

    void this.readUnits(uid).then(
      (units) => {
        if (!this.isCurrent(uid, generation)) return
        this.units = units
        this.unitsReady = true
        this.emitSnapshot(uid, generation)
      },
      (error) => this.fail(uid, generation, error),
    )

    this.unsubscribe = this.subscribe(
      uid,
      (snapshot) => {
        if (!this.isCurrent(uid, generation)) return
        this.latestSnapshot = snapshot
        this.emitSnapshot(uid, generation)
      },
      (error) => this.fail(uid, generation, error),
    )
  }

  retry(): void {
    if (this.uid) this.start(this.uid)
  }

  clear(): void {
    this.stopListener()
    this.uid = null
    this.generation += 1
  }

  dispose(): void {
    this.clear()
  }

  private stopListener(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private isCurrent(uid: string, generation: number): boolean {
    return this.uid === uid && this.generation === generation
  }

  private emitSnapshot(uid: string, generation: number): void {
    if (!this.unitsReady || !this.latestSnapshot || !this.isCurrent(uid, generation)) return
    const snapshot = this.latestSnapshot
    try {
      if (!snapshot.exists) {
        this.onState({
          status: snapshot.fromCache || snapshot.hasPendingWrites ? 'cache-miss' : 'empty',
          session: null,
          units: this.units,
        })
        return
      }
      this.onState({
        status: 'ready',
        session: parseSessionDocument(uid, snapshot.data),
        units: this.units,
        stale: snapshot.fromCache || snapshot.hasPendingWrites,
      })
    } catch (error) {
      if (snapshot.fromCache || snapshot.hasPendingWrites) {
        this.onState({ status: 'error', session: null, units: this.units, message: errorMessage(error) })
        return
      }
      this.fail(uid, generation, error)
    }
  }

  private fail(uid: string, generation: number, error: unknown): void {
    if (!this.isCurrent(uid, generation)) return
    this.stopListener()
    this.latestSnapshot = null
    this.generation += 1
    this.onState({ status: 'error', session: null, units: this.units, message: errorMessage(error) })
  }
}
