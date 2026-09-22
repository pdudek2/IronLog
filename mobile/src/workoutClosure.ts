import { classifyClosureFailure, type ClosureFailureState } from '../../src/lib/activeSessionSyncPolicy'
import type { ActiveWorkout } from './session'

export type ClosureAction = 'finish' | 'discard'

/** Durable record of a closure the server may already have applied; retried verbatim, the server is idempotent. */
export interface ClosureIntent {
  action: ClosureAction
  sessionId: string
  sessionRevision: string | null
  createdAt: number
}

export interface ClosureIntentStorage {
  read(uid: string, slot: 0 | 1): Promise<string | null>
  write(uid: string, slot: 0 | 1, value: string): Promise<void>
  readLegacy(uid: string): Promise<string | null>
  clearLegacy(uid: string): Promise<void>
}

export type ClosureResult =
  | { action: 'finish'; workoutId: string; status: 'materialized' | 'projection_pending' }
  | { action: 'discard'; sessionId: string; status: 'discarded' }

export type ClosureJournalLoad =
  | { status: 'empty'; generation: number }
  | { status: 'intent'; generation: number; intent: ClosureIntent }
  | { status: 'corrupt' }

interface StoredClosureIntent extends ClosureIntent {
  formatVersion: 1
  generation: number
  kind: 'intent'
  uid: string
}

interface StoredClosureEmpty {
  formatVersion: 1
  generation: number
  kind: 'empty'
  uid: string
}

type StoredClosureRecord = StoredClosureIntent | StoredClosureEmpty

export class ClosureRequestError extends Error {
  constructor(
    readonly kind: 'ambiguous' | 'definitive',
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ClosureRequestError'
  }
}

export interface ClosureRequestDependencies {
  apiBaseUrl: string
  getIdToken: () => Promise<string>
  fetch: typeof fetch
  timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validDocumentId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('/')
}

function parseIntent(uid: string, value: Record<string, unknown>): ClosureIntent {
  if (value.uid !== uid || (value.action !== 'finish' && value.action !== 'discard')
    || !validDocumentId(value.sessionId)
    || (value.sessionRevision !== null && !validDocumentId(value.sessionRevision))
    || (value.action === 'finish' && value.sessionRevision === null)
    || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) || value.createdAt <= 0) {
    throw new Error('Invalid closure intent.')
  }
  return {
    action: value.action,
    sessionId: value.sessionId,
    sessionRevision: value.sessionRevision as string | null,
    createdAt: value.createdAt,
  }
}

function parseSlot(uid: string, raw: string | null): StoredClosureRecord | null {
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Invalid closure journal JSON.')
  }
  if (!isRecord(value) || value.formatVersion !== 1 || value.uid !== uid
    || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1) {
    throw new Error('Invalid closure journal record.')
  }
  const base = { formatVersion: 1 as const, generation: Number(value.generation), uid }
  if (value.kind === 'empty') return { ...base, kind: 'empty' }
  if (value.kind !== 'intent') throw new Error('Invalid closure journal kind.')
  return { ...base, kind: 'intent', ...parseIntent(uid, value) }
}

function parseLegacy(uid: string, raw: string): ClosureIntent {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Invalid legacy closure intent.')
  }
  if (!isRecord(value)) throw new Error('Invalid legacy closure intent.')
  return parseIntent(uid, value)
}

/**
 * Two slots keep the last complete closure record available while the other slot is written.
 * The serialized queue also prevents old mounted runtimes from racing newer writes for one uid.
 */
export class ClosureIntentJournal {
  private readonly generations = new Map<string, number>()
  private readonly loaded = new Set<string>()
  private readonly queues = new Map<string, Promise<void>>()

  constructor(private readonly storage: ClosureIntentStorage) {}

  load(uid: string): Promise<ClosureJournalLoad> {
    return this.exclusive(uid, async () => {
      this.loaded.delete(uid)
      this.generations.delete(uid)
      const raw = await Promise.all([this.storage.read(uid, 0), this.storage.read(uid, 1)])
      const records: StoredClosureRecord[] = []
      let invalid = false
      for (const value of raw) {
        if (value === null) continue
        try {
          const record = parseSlot(uid, value)
          if (record) records.push(record)
        } catch {
          invalid = true
        }
      }

      const newest = records.sort((a, b) => b.generation - a.generation)[0]
      if (newest) {
        this.generations.set(uid, newest.generation)
        this.loaded.add(uid)
        await this.storage.clearLegacy(uid).catch(() => undefined)
        return newest.kind === 'empty'
          ? { status: 'empty', generation: newest.generation }
          : { status: 'intent', generation: newest.generation, intent: toIntent(newest) }
      }

      this.loaded.delete(uid)
      this.generations.delete(uid)
      const legacy = await this.storage.readLegacy(uid)
      if (legacy !== null) {
        let intent: ClosureIntent
        try {
          intent = parseLegacy(uid, legacy)
        } catch {
          return { status: 'corrupt' }
        }
        const generation = 1
        const record: StoredClosureIntent = { formatVersion: 1, generation, uid, kind: 'intent', ...intent }
        // Keep the old file until its complete replacement is durable.
        await this.storage.write(uid, (generation % 2) as 0 | 1, JSON.stringify(record))
        this.generations.set(uid, generation)
        this.loaded.add(uid)
        await this.storage.clearLegacy(uid).catch(() => undefined)
        return { status: 'intent', generation, intent }
      }
      if (invalid) return { status: 'corrupt' }
      this.generations.set(uid, 0)
      this.loaded.add(uid)
      return { status: 'empty', generation: 0 }
    })
  }

  writeIntent(uid: string, intent: ClosureIntent): Promise<number> {
    return this.exclusive(uid, async () => {
      this.assertLoaded(uid)
      const generation = (this.generations.get(uid) ?? 0) + 1
      const validated = parseIntent(uid, { uid, ...intent })
      const record: StoredClosureIntent = { formatVersion: 1, generation, uid, kind: 'intent', ...validated }
      await this.storage.write(uid, (generation % 2) as 0 | 1, JSON.stringify(record))
      this.generations.set(uid, generation)
      return generation
    })
  }

  /** Returns false when another runtime has already advanced this owner's journal. */
  clear(uid: string, expectedGeneration: number): Promise<boolean> {
    return this.exclusive(uid, async () => {
      this.assertLoaded(uid)
      if (this.generations.get(uid) !== expectedGeneration) return false
      const generation = expectedGeneration + 1
      const record: StoredClosureEmpty = { formatVersion: 1, generation, uid, kind: 'empty' }
      await this.storage.write(uid, (generation % 2) as 0 | 1, JSON.stringify(record))
      this.generations.set(uid, generation)
      return true
    })
  }

  private assertLoaded(uid: string): void {
    if (!this.loaded.has(uid)) throw new Error('The closure journal must be read before it is changed.')
  }

  private exclusive<T>(uid: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(uid) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    this.queues.set(uid, result.then(() => undefined, () => undefined))
    return result
  }
}

function toIntent(record: StoredClosureIntent): ClosureIntent {
  return {
    action: record.action,
    sessionId: record.sessionId,
    sessionRevision: record.sessionRevision,
    createdAt: record.createdAt,
  }
}

export type ClosureState =
  | { status: 'loading' | 'ready' | 'read_failed' | 'corrupt' }
  | { status: 'submitting'; intent: ClosureIntent; locked: true }
  | { status: 'intent_storage_failed'; intent: ClosureIntent; locked: false }
  | { status: 'retry_storage_failed'; intent: ClosureIntent; locked: true }
  | {
    status: 'resolution_storage_failed'
    intent: ClosureIntent
    locked: true
    resolvedFailure?: ClosureFailureState
    result?: ClosureResult
  }
  | { status: ClosureFailureState; intent: ClosureIntent; locked: boolean }

export function isClosureLocked(state: ClosureState): boolean {
  return 'locked' in state ? state.locked : state.status !== 'ready'
}

const RESOLVED_BY_RELOAD: ClosureFailureState[] = ['session_mismatch', 'closure_conflict', 'active_session_changed']

interface ClosureRecoveryResolution {
  intent: ClosureIntent
  generation: number
  failure?: ClosureFailureState
  result?: ClosureResult
}

/** Owns startup recovery and request lifetime for one authenticated uid. */
export class WorkoutClosureController {
  private state: ClosureState = { status: 'loading' }
  private completed: ClosureResult | null = null
  private token = 0
  private inFlight = false
  private disposed = false
  private resolution: ClosureRecoveryResolution | null = null

  constructor(
    private readonly uid: string,
    private readonly journal: ClosureIntentJournal,
    private readonly request: (intent: ClosureIntent) => Promise<ClosureResult>,
    private readonly onState: (state: ClosureState, completed: ClosureResult | null) => void,
  ) {}

  start(): Promise<void> {
    this.disposed = false
    return this.readIntent()
  }

  canEdit(): boolean {
    return !this.disposed && (this.state.status === 'ready'
      || this.state.status === 'intent_storage_failed')
  }

  startClosure(action: ClosureAction, session: ActiveWorkout): Promise<void> {
    if (this.disposed || this.inFlight || (this.state.status !== 'ready' && this.state.status !== 'intent_storage_failed')) return Promise.resolve()
    const intent: ClosureIntent = {
      action,
      sessionId: session.sessionId,
      sessionRevision: session.sessionRevision,
      createdAt: Date.now(),
    }
    try {
      parseIntent(this.uid, { uid: this.uid, ...intent })
    } catch {
      return Promise.resolve()
    }
    this.completed = null
    return this.submit(intent, true)
  }

  retry(): Promise<void> {
    if (this.disposed || this.inFlight) return Promise.resolve()
    if (this.state.status === 'read_failed' || this.state.status === 'corrupt') return this.readIntent()
    if (this.state.status === 'intent_storage_failed') return this.submit(this.state.intent, true)
    if (this.state.status === 'retry_storage_failed') return this.submit(this.state.intent, false)
    if (this.state.status === 'resolution_storage_failed' && this.resolution) return this.retryResolution()
    const pendingIntent = this.pendingIntent()
    if (pendingIntent) return this.submit(pendingIntent, false)
    return Promise.resolve()
  }

  dismiss(): void {
    if (this.disposed) return
    const dismissable = this.state.status === 'intent_storage_failed'
      || (this.state.status !== 'ready' && 'intent' in this.state && RESOLVED_BY_RELOAD.includes(this.state.status as ClosureFailureState))
    if (!dismissable) return
    this.resolution = null
    this.publish({ status: 'ready' })
  }

  dispose(): void {
    this.disposed = true
    this.token += 1
  }

  private readIntent(): Promise<void> {
    const token = ++this.token
    this.inFlight = false
    this.resolution = null
    this.publish({ status: 'loading' })
    return this.journal.load(this.uid).then((result) => {
      if (!this.current(token)) return
      if (result.status === 'corrupt') {
        this.publish({ status: 'corrupt' })
      } else if (result.status === 'intent') {
        this.publish({ status: 'closure_unconfirmed', intent: result.intent, locked: true })
      } else {
        this.publish({ status: 'ready' })
      }
    }, () => {
      if (this.current(token)) this.publish({ status: 'read_failed' })
    })
  }

  private async submit(intent: ClosureIntent, isNew: boolean): Promise<void> {
    const token = ++this.token
    this.inFlight = true
    this.resolution = null
    this.publish({ status: 'submitting', intent, locked: true })
    let generation: number
    try {
      generation = await this.journal.writeIntent(this.uid, intent)
    } catch {
      if (this.current(token)) this.publish(isNew
        ? { status: 'intent_storage_failed', intent, locked: false }
        : { status: 'retry_storage_failed', intent, locked: true })
      this.inFlight = false
      return
    }
    if (!this.current(token)) return

    try {
      const result = await this.request(intent)
      if (!this.current(token)) return
      await this.resolve(token, { intent, generation, result })
    } catch (error) {
      if (!this.current(token)) return
      const failure = closureFailure(error)
      if (RESOLVED_BY_RELOAD.includes(failure)) {
        await this.resolve(token, { intent, generation, failure })
      } else {
        this.publish({ status: failure, intent, locked: true })
      }
    } finally {
      if (this.current(token)) this.inFlight = false
    }
  }

  private async resolve(token: number, resolution: ClosureRecoveryResolution): Promise<void> {
    this.resolution = resolution
    try {
      const cleared = await this.journal.clear(this.uid, resolution.generation)
      if (!this.current(token)) return
      if (!cleared) {
        this.resolution = null
        await this.adoptLatest(token)
        return
      }
      this.resolution = null
      if (resolution.result) {
        this.completed = resolution.result
        this.publish({ status: 'ready' })
      } else if (resolution.failure) {
        this.publish({ status: resolution.failure, intent: resolution.intent, locked: true })
      } else {
        this.publish({ status: 'ready' })
      }
    } catch {
      if (!this.current(token)) return
      this.publish({
        status: 'resolution_storage_failed',
        intent: resolution.intent,
        locked: true,
        ...(resolution.failure ? { resolvedFailure: resolution.failure } : {}),
        ...(resolution.result ? { result: resolution.result } : {}),
      })
    }
  }

  private async retryResolution(): Promise<void> {
    const resolution = this.resolution
    if (!resolution || this.inFlight) return
    const token = ++this.token
    this.inFlight = true
    try {
      const cleared = await this.journal.clear(this.uid, resolution.generation)
      if (!this.current(token)) return
      if (!cleared) {
        this.resolution = null
        await this.adoptLatest(token)
      } else {
        this.resolution = null
        if (resolution.result) this.completed = resolution.result
        this.publish(resolution.failure
          ? { status: resolution.failure, intent: resolution.intent, locked: true }
          : { status: 'ready' })
      }
    } catch {
      if (this.current(token)) this.publish({
        status: 'resolution_storage_failed',
        intent: resolution.intent,
        locked: true,
        ...(resolution.failure ? { resolvedFailure: resolution.failure } : {}),
        ...(resolution.result ? { result: resolution.result } : {}),
      })
    } finally {
      if (this.current(token)) this.inFlight = false
    }
  }

  private async adoptLatest(token: number): Promise<void> {
    try {
      const latest = await this.journal.load(this.uid)
      if (!this.current(token)) return
      if (latest.status === 'corrupt') this.publish({ status: 'corrupt' })
      else if (latest.status === 'intent') this.publish({ status: 'closure_unconfirmed', intent: latest.intent, locked: true })
      else this.publish({ status: 'ready' })
    } catch {
      if (this.current(token)) this.publish({ status: 'read_failed' })
    }
  }

  private pendingIntent(): ClosureIntent | null {
    if (!('intent' in this.state) || !this.state.locked || this.state.status === 'submitting'
      || this.state.status === 'resolution_storage_failed'
      || this.state.status === 'retry_storage_failed') return null
    if (RESOLVED_BY_RELOAD.includes(this.state.status as ClosureFailureState)) return null
    return this.state.intent
  }

  private current(token: number): boolean {
    return !this.disposed && token === this.token
  }

  private publish(state: ClosureState): void {
    this.state = state
    this.onState(state, this.completed)
  }
}

export function closureFailure(error: unknown): ClosureFailureState {
  return error instanceof ClosureRequestError
    ? classifyClosureFailure({ kind: error.kind, code: error.code, status: error.status })
    : 'closure_unconfirmed'
}

export async function requestClosure(intent: ClosureIntent, dependencies: ClosureRequestDependencies): Promise<ClosureResult> {
  const finish = intent.action === 'finish'
  if (finish && !intent.sessionRevision) throw new ClosureRequestError('definitive', 'A saved session revision is required.')
  const payload = await post(dependencies, finish ? '/api/finalize-workout' : '/api/discard-session', finish
    ? { sessionId: intent.sessionId, sessionRevision: intent.sessionRevision }
    : { sessionId: intent.sessionId })
  if (finish) {
    if (payload.workoutId !== intent.sessionId || (payload.status !== 'materialized' && payload.status !== 'projection_pending')) {
      throw new ClosureRequestError('ambiguous', 'The server returned an unreadable response.')
    }
    return { action: 'finish', workoutId: payload.workoutId, status: payload.status }
  }
  if (payload.status !== 'discarded') throw new ClosureRequestError('ambiguous', 'The server returned an unreadable response.')
  return { action: 'discard', sessionId: intent.sessionId, status: 'discarded' }
}

async function post(dependencies: ClosureRequestDependencies, path: string, body: unknown): Promise<Record<string, unknown>> {
  let token: string
  try {
    token = await dependencies.getIdToken()
  } catch {
    throw new ClosureRequestError('definitive', 'No active user session.', undefined, 'unauthenticated')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 15_000)
  let response: Response
  let payload: unknown
  try {
    response = await dependencies.fetch(`${dependencies.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    payload = await response.json().catch(() => null)
  } catch {
    throw new ClosureRequestError('ambiguous', 'Could not confirm session closure.')
  } finally {
    clearTimeout(timeout)
  }
  const record = isRecord(payload) ? payload : null
  if (response.ok && record) return record
  if (response.status >= 400 && response.status < 500 && record && typeof record.error === 'string') {
    throw new ClosureRequestError('definitive', record.error, response.status, typeof record.code === 'string' ? record.code : undefined)
  }
  throw new ClosureRequestError('ambiguous', 'Could not confirm session closure.', response.status)
}
