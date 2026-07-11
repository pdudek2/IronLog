import type { BrowserDiagnostic } from './browserDiagnostics'

const FIRESTORE_CHANNEL_URL = /^https?:\/\/(?:127\.0\.0\.1:8080|firestore\.googleapis\.com)\/google\.firestore\.v1\.Firestore\/(?:Listen|Write)\/channel\?/
const FIRESTORE_BATCH_GET_URL = /^https?:\/\/(?:127\.0\.0\.1:8080|firestore\.googleapis\.com)\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents:batchGet\?/

function hasFirestoreRequestUrl(entry: BrowserDiagnostic): boolean {
  return Boolean(entry.url) && (
    FIRESTORE_CHANNEL_URL.test(entry.url!)
    || FIRESTORE_BATCH_GET_URL.test(entry.url!)
  )
}

export function isExpectedFirestoreOfflineDiagnostic(entry: BrowserDiagnostic): boolean {
  if (entry.kind === 'requestfailed' && entry.url) {
    if (entry.message === 'net::ERR_ABORTED') return FIRESTORE_CHANNEL_URL.test(entry.url)
    if (entry.message !== 'net::ERR_INTERNET_DISCONNECTED') return false
    return hasFirestoreRequestUrl(entry)
  }

  if (entry.kind !== 'console') return false
  return (
    entry.message === 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED'
    && hasFirestoreRequestUrl(entry)
  )
    || entry.message === '[useTemplateWorkoutLaunch] confirmed launch failed FirebaseError: Connection failed.'
    || entry.message === '[useTemplateWorkoutLaunch] confirmed launch failed FirebaseError: Failed to get document because the client is offline.'
}
