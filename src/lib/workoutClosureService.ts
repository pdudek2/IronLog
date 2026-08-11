import type { ActiveWorkout } from '../store/workoutStore'
import { auth } from './firebase'
import { buildFinishedWorkoutPayload } from './workoutService'

export type WorkoutClosureErrorKind = 'ambiguous' | 'definitive'
export type FinalizeWorkoutStatus = 'materialized' | 'projection_pending'

const CLOSURE_REQUEST_TIMEOUT_MS = 15_000

export interface FinalizeWorkoutResult {
  workoutId: string
  status: FinalizeWorkoutStatus
}

export interface DiscardWorkoutResult {
  status: 'discarded'
}

export class WorkoutClosureError extends Error {
  readonly kind: WorkoutClosureErrorKind
  readonly status?: number
  readonly code?: string
  readonly cause?: unknown

  constructor(
    kind: WorkoutClosureErrorKind,
    message: string,
    options: { status?: number; code?: string; cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'WorkoutClosureError'
    this.kind = kind
    this.status = options.status
    this.code = options.code
    this.cause = options.cause
  }
}

export async function finalizeWorkout(session: ActiveWorkout): Promise<FinalizeWorkoutResult> {
  const result = await callClosureEndpoint('/api/finalize-workout', buildFinishedWorkoutPayload(session))
  if (
    !isRecord(result)
    || result.workoutId !== session.sessionId
    || (result.status !== 'materialized' && result.status !== 'projection_pending')
  ) {
    throw ambiguousResponse()
  }
  return { workoutId: result.workoutId, status: result.status }
}

export async function discardWorkoutSession(sessionId: string): Promise<DiscardWorkoutResult> {
  const result = await callClosureEndpoint('/api/discard-session', { sessionId })
  if (!isRecord(result) || result.status !== 'discarded') throw ambiguousResponse()
  return { status: 'discarded' }
}

async function callClosureEndpoint(path: string, body: unknown): Promise<unknown> {
  const user = auth.currentUser
  if (!user) {
    throw new WorkoutClosureError('definitive', 'Brak aktywnej sesji użytkownika.', {
      code: 'unauthenticated',
    })
  }

  const idToken = await user.getIdToken()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CLOSURE_REQUEST_TIMEOUT_MS)
  let response: Response
  let payload: unknown
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    payload = await response.json().catch(() => null) as unknown
  } catch (cause) {
    throw new WorkoutClosureError('ambiguous', 'Nie udało się potwierdzić zamknięcia sesji.', {
      cause,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (response.ok) {
    if (payload === null) throw ambiguousResponse(response.status)
    return payload
  }

  if (response.status >= 400 && response.status < 500 && isStructuredError(payload)) {
    throw new WorkoutClosureError('definitive', payload.error, {
      status: response.status,
      ...(payload.code ? { code: payload.code } : {}),
    })
  }

  throw new WorkoutClosureError('ambiguous', 'Nie udało się potwierdzić zamknięcia sesji.', {
    status: response.status,
  })
}

function ambiguousResponse(status?: number): WorkoutClosureError {
  return new WorkoutClosureError('ambiguous', 'Serwer zwrócił nieczytelną odpowiedź.', { status })
}

function isStructuredError(value: unknown): value is { error: string; code?: string } {
  return isRecord(value)
    && typeof value.error === 'string'
    && (value.code === undefined || typeof value.code === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
