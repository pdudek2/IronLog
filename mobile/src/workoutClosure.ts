import { classifyClosureFailure, type ClosureFailureState } from '../../src/lib/activeSessionSyncPolicy'

export type ClosureAction = 'finish' | 'discard'

/** Durable record of a closure the server may already have applied; retried verbatim, the server is idempotent. */
export interface ClosureIntent {
  action: ClosureAction
  sessionId: string
  sessionRevision: string | null
  createdAt: number
}

export interface ClosureIntentStorage {
  read(uid: string): Promise<string | null>
  write(uid: string, value: string): Promise<void>
  clear(uid: string): Promise<void>
}

export type ClosureResult =
  | { action: 'finish'; workoutId: string; status: 'materialized' | 'projection_pending' }
  | { action: 'discard'; status: 'discarded' }

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

export async function readClosureIntent(storage: ClosureIntentStorage, uid: string): Promise<ClosureIntent | null> {
  const raw = await storage.read(uid)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value.uid !== uid || (value.action !== 'finish' && value.action !== 'discard')
      || typeof value.sessionId !== 'string' || !value.sessionId
      || (value.sessionRevision !== null && (typeof value.sessionRevision !== 'string' || !value.sessionRevision))
      || typeof value.createdAt !== 'number') return null
    return { action: value.action, sessionId: value.sessionId, sessionRevision: value.sessionRevision as string | null, createdAt: value.createdAt }
  } catch {
    return null
  }
}

export function writeClosureIntent(storage: ClosureIntentStorage, uid: string, intent: ClosureIntent): Promise<void> {
  return storage.write(uid, JSON.stringify({ uid, ...intent }))
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
  return { action: 'discard', status: 'discarded' }
}

export function closureFailure(error: unknown): ClosureFailureState {
  return error instanceof ClosureRequestError
    ? classifyClosureFailure({ kind: error.kind, code: error.code, status: error.status })
    : 'closure_unconfirmed'
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
  const record = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null
  if (response.ok && record) return record
  if (response.status >= 400 && response.status < 500 && record && typeof record.error === 'string') {
    throw new ClosureRequestError('definitive', record.error, response.status, typeof record.code === 'string' ? record.code : undefined)
  }
  throw new ClosureRequestError('ambiguous', 'Could not confirm session closure.', response.status)
}
