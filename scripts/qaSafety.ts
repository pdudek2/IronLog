import type { BrowserContext } from '@playwright/test'

export function assertLocalQaEmulators(env: NodeJS.ProcessEnv): void {
  if (env.E2E_BACKEND !== 'emulator'
    || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
    throw new Error('QA requires E2E_BACKEND=emulator and the local Auth (127.0.0.1:9099) and Firestore (127.0.0.1:8080) emulators.')
  }
}

export function resolveQaCapture(env: NodeJS.ProcessEnv, baseUrl = 'http://localhost:5174') {
  assertLocalQaEmulators(env)
  const url = new URL(baseUrl)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('QA capture URL must be a local HTTP origin.')
  }
  if (!env.TEST_EMAIL || !env.TEST_PASSWORD) {
    throw new Error('QA capture requires TEST_EMAIL and TEST_PASSWORD for a seeded emulator account.')
  }
  return { baseUrl: url.origin, email: env.TEST_EMAIL, password: env.TEST_PASSWORD }
}

export function isAllowedQaCaptureRequest(rawUrl: string, baseUrl: string): boolean {
  const url = new URL(rawUrl)
  if (url.origin === baseUrl) return !/^\/api(?:\/|$)/.test(url.pathname)
  return [
    'http://127.0.0.1:8080',
    'http://127.0.0.1:9099',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ].includes(url.origin)
}

// Capture scripts never call local server APIs: an existing server may use live Admin credentials.
export async function guardQaCaptureContext(context: BrowserContext, baseUrl: string): Promise<void> {
  await context.route('**/*', (route) => isAllowedQaCaptureRequest(route.request().url(), baseUrl)
    ? route.continue()
    : route.abort('blockedbyclient'))
}
