import type { BrowserDiagnostic } from './browserDiagnostics'

const PROJECTION_FAILURE_MESSAGE = 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)'

export function isExpectedWorkoutReviewProjectionDiagnostic(entry: BrowserDiagnostic): boolean {
  if (entry.kind !== 'console' || entry.message !== PROJECTION_FAILURE_MESSAGE || !entry.url) return false

  try {
    const source = new URL(entry.url)
    return source.origin === 'http://localhost:5174'
      && source.pathname === '/api/materialize-workout'
  } catch {
    return false
  }
}
