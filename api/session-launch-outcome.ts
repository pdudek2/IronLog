import { requireUserId } from './_lib/auth.js'
import { isSessionClosedForUser } from './_lib/workoutClosure.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<{ sessionId?: unknown }>(req, { maxBytes: 8 * 1024 })
    const closed = await isSessionClosedForUser(userId, body?.sessionId)
    sendJson(res, 200, { status: closed ? 'closed' : 'open' })
  } catch (error) {
    sendApiError(res, error, { fallbackMessage: 'Could not confirm the session outcome.' })
  }
}
