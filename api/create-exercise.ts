import { requireUserId } from './_lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { createExerciseForUser, parseCreateExerciseRequest } from './_lib/exerciseCreateService.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed.' }); return }
  try {
    const userId = await requireUserId(req)
    const exercise = await createExerciseForUser(userId, parseCreateExerciseRequest(await readJsonBody(req)))
    sendJson(res, 200, { exercise })
  } catch (error) { sendApiError(res, error, { fallbackMessage: 'Could not create the exercise.' }) }
}
