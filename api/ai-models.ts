import { requireUserId } from './_lib/auth.js'
import { openrouterApiError, openrouterNetworkError } from './_lib/openrouterErrors.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { RateLimitError, assertRateLimit } from './_lib/rateLimit.js'
import { COACH_MODEL, readCoachQuota } from './_lib/coachQuota.js'

export const config = {
  maxDuration: 15,
}

interface AiModelsBody {
  apiKey?: string
  quota?: unknown
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

    // The Hobby plan allows 12 functions, so the shared-key allowance is read here; `quota: true` asks for it.
    if (body.quota === true && body.apiKey === undefined) {
      sendJson(res, 200, { ...await readCoachQuota(userId), shared: Boolean(process.env.OPENROUTER_API_KEY?.trim()) })
      return
    }

    if (apiKey.length < 20) {
      sendJson(res, 400, { error: 'A valid OpenRouter API key is required.' })
      return
    }

    const upstream = await fetch('https://openrouter.ai/api/v1/key', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }).catch(() => {
      throw openrouterNetworkError()
    })

    if (!upstream.ok) {
      throw openrouterApiError(upstream.status)
    }

    sendJson(res, 200, { models: [{ id: COACH_MODEL, label: 'GPT-5.6 Luna' }] })
  } catch (error) {
    if (error instanceof RateLimitError) {
      res.setHeader('Retry-After', String(error.retryAfterSeconds))
      sendJson(res, 429, { error: error.message })
      return
    }

    sendApiError(res, error, { fallbackMessage: 'Could not load OpenRouter models.' })
  }
}
