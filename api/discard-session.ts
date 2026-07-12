import { requireUserId } from './lib/auth.js'
import { discardSessionForUser } from './lib/workoutClosure.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './lib/http.js'

interface DiscardSessionBody {
  sessionId?: unknown
}

const MAX_DISCARD_BODY_BYTES = 8 * 1024

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<DiscardSessionBody>(req, { maxBytes: MAX_DISCARD_BODY_BYTES })
    const result = await discardSessionForUser(userId, body.sessionId as string)
    sendJson(res, 200, result)
  } catch (error) {
    sendApiError(res, error, {
      fallbackMessage: 'Nie udało się odrzucić sesji.',
      fallbackStatus: 500,
    })
  }
}
