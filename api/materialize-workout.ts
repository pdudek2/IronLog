import { requireUserId } from './_lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { materializeWorkoutForUser } from './_lib/workoutProjection.js'

interface MaterializeBody {
  workoutId?: string
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<MaterializeBody>(req, { maxBytes: 8 * 1024 })

    if (!body.workoutId) {
      sendJson(res, 400, { error: 'Brak workoutId.' })
      return
    }

    await materializeWorkoutForUser(userId, body.workoutId)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendApiError(res, error, { fallbackMessage: 'Nie udało się zsynchronizować treningu.' })
  }
}
