import { requireUserId } from './_lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { importWorkoutsForUser, parseImportWorkoutsRequest } from './_lib/historyImport.js'
import { materializeWorkoutForUser } from './_lib/workoutProjection.js'

interface MaterializeBody {
  workoutId?: string
  importId?: unknown
}

// The Hobby plan allows 12 functions, so /api/import-workouts is rewritten to this one; the body tells them apart.
const MAX_BODY_BYTES = 512 * 1024

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<MaterializeBody>(req, { maxBytes: MAX_BODY_BYTES })
    if (body.importId !== undefined) {
      sendJson(res, 200, await importWorkoutsForUser(userId, parseImportWorkoutsRequest(body, Date.now())))
      return
    }

    if (!body.workoutId) {
      sendJson(res, 400, { error: 'Missing workoutId.' })
      return
    }

    await materializeWorkoutForUser(userId, body.workoutId)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    sendApiError(res, error, { fallbackMessage: 'Could not sync the workout.' })
  }
}
