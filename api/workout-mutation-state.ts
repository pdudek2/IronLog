import { requireUserId } from './_lib/auth.js'
import { readJsonBody, sendApiError, sendJson, type ApiRequest, type ApiResponse } from './_lib/http.js'
import { readWorkoutMutationState } from './_lib/workoutProjection.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed.' }); return }
  try {
    const uid = await requireUserId(req)
    const body = await readJsonBody<{ workoutId: string; operationId?: string }>(req, { maxBytes: 8 * 1024 })
    sendJson(res, 200, await readWorkoutMutationState(uid, body.workoutId, body.operationId))
  } catch (error) { sendApiError(res, error, { fallbackMessage: 'Could not check workout changes.' }) }
}
