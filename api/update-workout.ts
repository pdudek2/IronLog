import { requireUserId } from './_lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { updateFinishedWorkoutForUser } from './_lib/workoutProjection.js'

interface UpdateWorkoutBody {
  workoutId?: string
  label?: string | null
  exercises?: unknown
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<UpdateWorkoutBody>(req, { maxBytes: 128 * 1024 })

    if (!body.workoutId) {
      sendJson(res, 400, { error: 'Brak workoutId.' })
      return
    }

    await updateFinishedWorkoutForUser(userId, body.workoutId, {
      label: body.label,
      exercises: body.exercises,
    })

    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendApiError(res, error, { fallbackMessage: 'Nie udało się zaktualizować treningu.' })
  }
}
