import { parseWorkoutMutationGuard } from './_lib/workoutMutationGuard.js'
import { requireRecentUserId, requireUserId } from './_lib/auth.js'
import { deleteAccountForUser } from './_lib/accountDeletion.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { deleteFinishedWorkoutForUser } from './_lib/workoutProjection.js'

interface DeleteWorkoutBody {
  operationId?: string
  baseline?: string
  workoutId?: string
  deleteAccount?: unknown
}

// The Hobby plan allows 12 functions, so /api/delete-account is rewritten to this one; `deleteAccount: true` tells them apart.

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  let fallbackMessage = 'Could not delete the workout.'
  try {
    const body = await readJsonBody<DeleteWorkoutBody>(req, { maxBytes: 8 * 1024 })
    if (body.deleteAccount === true && body.workoutId === undefined) {
      fallbackMessage = 'Could not delete your account. Try again.'
      await deleteAccountForUser(await requireRecentUserId(req))
      sendJson(res, 200, { ok: true })
      return
    }
    const userId = await requireUserId(req)

    if (!body.workoutId) {
      sendJson(res, 400, { error: 'Missing workoutId.' })
      return
    }

    const result = await deleteFinishedWorkoutForUser(userId, body.workoutId, { guard: parseWorkoutMutationGuard(body) })
    sendJson(res, 200, result)
  } catch (error) {
    sendApiError(res, error, { fallbackMessage })
  }
}
