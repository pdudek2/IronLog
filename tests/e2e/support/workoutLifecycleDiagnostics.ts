import type { BrowserDiagnostic } from './browserDiagnostics'

const HTTP_FAILURE_MESSAGE = 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'

function hasEndpoint(entry: BrowserDiagnostic, pathname: string): boolean {
  if (!entry.url) return false
  try {
    const source = new URL(entry.url)
    return source.origin === 'http://localhost:5174' && source.pathname === pathname
  } catch {
    return false
  }
}

export function isExpectedWorkoutLifecycleProjectionDiagnostic(entry: BrowserDiagnostic): boolean {
  return entry.kind === 'console'
    && entry.message === HTTP_FAILURE_MESSAGE
    && hasEndpoint(entry, '/api/materialize-workout')
}

export function isExpectedWorkoutLifecycleAckLossDiagnostic(entry: BrowserDiagnostic): boolean {
  if (!hasEndpoint(entry, '/api/finalize-workout') && !hasEndpoint(entry, '/api/discard-session')) {
    return false
  }
  if (entry.kind === 'requestfailed') return entry.message === 'net::ERR_FAILED' && entry.method === 'POST'
  if (entry.kind !== 'console') return false
  return entry.message === 'Failed to load resource: net::ERR_FAILED'
    || /^\[(?:finish workout closure error|discard workout closure error)\] WorkoutClosureError: Nie udało się potwierdzić zamknięcia sesji\.$/.test(entry.message)
}

export function isExpectedWorkoutLifecycleTombstoneDiagnostic(entry: BrowserDiagnostic): boolean {
  if (entry.kind !== 'console') return false
  return entry.message.startsWith('[active session save error] FirebaseError: PERMISSION_DENIED:')
    && /false for '(?:create|update)' @ L478/.test(entry.message)
}
