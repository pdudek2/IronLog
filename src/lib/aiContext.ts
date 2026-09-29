export const AI_CONTEXT_SOURCES = ['profile', 'readiness', 'workouts', 'records'] as const
export type AiContextSource = typeof AI_CONTEXT_SOURCES[number]

export interface AiContextMetadata {
  status: 'full' | 'limited'
  unavailableSources: AiContextSource[]
}

const AI_CONTEXT_HEADER = 'X-IronLog-AI-Context'
const INVALID_CONTEXT_MESSAGE = 'AI Coach returned an invalid context status.'

export function parseAiContextHeader(headers: Headers): AiContextMetadata {
  const value = headers.get(AI_CONTEXT_HEADER)
  if (value === 'full') return { status: 'full', unavailableSources: [] }

  const prefix = 'limited;unavailable='
  if (!value?.startsWith(prefix)) throw new Error(INVALID_CONTEXT_MESSAGE)

  const rawSources = value.slice(prefix.length).split(',')
  const unavailableSources = rawSources.filter(
    (source): source is AiContextSource => AI_CONTEXT_SOURCES.includes(source as AiContextSource),
  )
  const canonical = AI_CONTEXT_SOURCES.filter((source) => unavailableSources.includes(source))
  if (
    unavailableSources.length === 0
    || unavailableSources.length > 3
    || unavailableSources.length !== rawSources.length
    || new Set(unavailableSources).size !== unavailableSources.length
    || canonical.join(',') !== rawSources.join(',')
  ) throw new Error(INVALID_CONTEXT_MESSAGE)

  return { status: 'limited', unavailableSources }
}
