export type BrowserDiagnosticKind = 'pageerror' | 'console' | 'requestfailed'

export interface BrowserDiagnostic {
  kind: BrowserDiagnosticKind
  message: string
  url?: string
  method?: string
  blocking: boolean
  expectedBy?: string
}

const NON_BLOCKING_CONSOLE_PATTERNS = [
  /\[vite\]/i,
  /(?:chrome|moz|safari-web)-extension:\/\//i,
]

export function isBlockingConsole(type: string, text: string): boolean {
  return type === 'error'
    && !NON_BLOCKING_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))
}

export function isBlockingRequestFailure(
  resourceType: string,
  errorText: string,
  url = '',
  intentionalNavigationOrTeardown = false,
): boolean {
  if (resourceType === 'document' && errorText === 'net::ERR_ABORTED') return false

  const isEmulatorFirestoreChannel = (resourceType === 'fetch' || resourceType === 'xhr')
    && /^http:\/\/127\.0\.0\.1:8080\/google\.firestore\.v1\.Firestore\/(?:Listen|Write)\/channel\?/.test(url)
  const isLocalViteSourceModule = resourceType === 'script'
    && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/src\/.+\.[cm]?[jt]sx?(?:\?.*)?$/.test(url)
  const isTrustedGoogleFont = resourceType === 'font'
    && /^https:\/\/fonts\.gstatic\.com\//.test(url)

  return !(
    intentionalNavigationOrTeardown
    && errorText === 'net::ERR_ABORTED'
    && (isEmulatorFirestoreChannel || isLocalViteSourceModule || isTrustedGoogleFont)
  )
}

export function formatBlockingDiagnostics(entries: BrowserDiagnostic[]): string {
  return entries
    .filter((entry) => entry.blocking)
    .map((entry) => {
      const request = entry.method && entry.url ? ` ${entry.method} ${entry.url}` : ''
      return `[${entry.kind}]${request} ${entry.message}`
    })
    .join('\n')
}
