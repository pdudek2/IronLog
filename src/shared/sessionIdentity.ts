export function createSessionId(): string {
  return crypto.randomUUID()
}

export function deriveLegacySessionId(userId: string, startedAt: number): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < userId.length; index += 1) {
    const code = userId.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  const ownerToken = [first, second]
    .map((value) => (value >>> 0).toString(16).padStart(8, '0'))
    .join('')
  return `legacy-${ownerToken}-${startedAt}`
}

export function normalizeSessionId(value: unknown, userId: string, startedAt: number): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return deriveLegacySessionId(userId, startedAt)
}
