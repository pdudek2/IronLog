import { requireUserId } from './lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendJson } from './lib/http.js'
import { materializeWorkoutForUser } from './lib/workoutProjection.js'

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
    const body = await readJsonBody<MaterializeBody>(req)

    if (!body.workoutId) {
      sendJson(res, 400, { error: 'Brak workoutId.' })
      return
    }

    await materializeWorkoutForUser(userId, body.workoutId)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udało się zsynchronizować treningu.'
    const status = message === 'Brak tokenu autoryzacji.' ? 401 : 400
    sendJson(res, status, { error: message })
  }
}
