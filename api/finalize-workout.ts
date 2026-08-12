import { requireUserId } from './_lib/auth.js'
import { finalizeWorkoutForUser } from './_lib/workoutClosure.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { parseFinalizeWorkoutRequest } from './_lib/workoutValidation.js'

const MAX_FINALIZE_BODY_BYTES = 128 * 1024

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<unknown>(req, { maxBytes: MAX_FINALIZE_BODY_BYTES })
    const result = await finalizeWorkoutForUser(userId, parseFinalizeWorkoutRequest(body))
    sendJson(res, 200, result)
  } catch (error) {
    sendApiError(res, error, {
      fallbackMessage: 'Nie udało się zakończyć treningu.',
      fallbackStatus: 500,
    })
  }
}
