import { requireUserId } from './_lib/auth.js'
import { anthropicApiError, anthropicNetworkError } from './_lib/anthropicErrors.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { RateLimitError, assertRateLimit } from './_lib/rateLimit.js'

export const config = {
  maxDuration: 15,
}

interface AiModelsBody {
  apiKey?: string
}

function getClientIp(req: ApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown'
  }

  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()

  return 'unknown'
}

function rankModel(id: string) {
  const normalized = id.toLowerCase()
  if (normalized.includes('sonnet-4.6')) return 1
  if (normalized.includes('opus-4.6')) return 2
  if (normalized.includes('sonnet-4')) return 3
  if (normalized.includes('opus-4.1')) return 4
  if (normalized.includes('opus-4')) return 5
  return 99
}

function humanizeModelLabel(id: string, displayName?: string) {
  if (displayName && displayName.trim()) return displayName.trim()

  return id
    .replace(/^claude-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const ip = getClientIp(req)
    await assertRateLimit({ key: `models:${userId}:${ip}`, limit: 12, windowMs: 60_000 })

    const body = await readJsonBody<AiModelsBody>(req, { maxBytes: 16 * 1024 })
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''

    if (apiKey.length < 20) {
      sendJson(res, 400, { error: 'Brak poprawnego Claude API key.' })
      return
    }

    const upstream = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    }).catch(() => {
      throw anthropicNetworkError()
    })

    if (!upstream.ok) {
      throw anthropicApiError(upstream.status)
    }

    const payload = await upstream.json().catch(() => null) as
      | { data?: Array<{ id?: string; display_name?: string }> }
      | null

    const models = (payload?.data ?? [])
      .flatMap((item) => {
        const id = typeof item.id === 'string' ? item.id.trim() : ''
        if (!id) return []

        return [{
          id,
          label: humanizeModelLabel(id, item.display_name),
        }]
      })
      .sort((a, b) => {
        const rankDiff = rankModel(a.id) - rankModel(b.id)
        return rankDiff !== 0 ? rankDiff : a.label.localeCompare(b.label, 'pl')
      })

    sendJson(res, 200, { models })
  } catch (error) {
    if (error instanceof RateLimitError) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds))
      sendJson(res, 429, { error: error.message })
      return
    }

    sendApiError(res, error, { fallbackMessage: 'Nie udało się pobrać modeli Claude.' })
  }
}
