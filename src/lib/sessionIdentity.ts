export function createSessionId(): string {
  return crypto.randomUUID()
}

export function normalizeSessionId(value: unknown, startedAt: number): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return `legacy-${startedAt}`
}
