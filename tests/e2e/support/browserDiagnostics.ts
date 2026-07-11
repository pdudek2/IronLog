export type BrowserDiagnosticKind = 'pageerror' | 'console' | 'requestfailed'

export interface BrowserDiagnostic {
  kind: BrowserDiagnosticKind
  message: string
  url?: string
  method?: string
  blocking: boolean
}

const NON_BLOCKING_CONSOLE_PATTERNS = [/\[vite\]/i, /extension/i]

export function isBlockingConsole(type: string, text: string): boolean {
  return type === 'error'
    && !NON_BLOCKING_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))
}

export function isBlockingRequestFailure(resourceType: string, errorText: string): boolean {
  return !(resourceType === 'document' && errorText === 'net::ERR_ABORTED')
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
