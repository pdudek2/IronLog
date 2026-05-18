import { requireUserId } from './lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './lib/http.js'
import { deleteFinishedWorkoutForUser } from './lib/workoutProjection.js'

interface DeleteWorkoutBody {
  workoutId?: string
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<DeleteWorkoutBody>(req, { maxBytes: 8 * 1024 })

    if (!body.workoutId) {
      sendJson(res, 400, { error: 'Brak workoutId.' })
      return
    }

    await deleteFinishedWorkoutForUser(userId, body.workoutId)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendApiError(res, error, { fallbackMessage: 'Nie udało się usunąć treningu.' })
  }
}
