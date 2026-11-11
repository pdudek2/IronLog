import { requireUserId } from './_lib/auth.js'
import { importWorkoutsForUser, parseImportWorkoutsRequest } from './_lib/historyImport.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'

const MAX_IMPORT_BODY_BYTES = 512 * 1024

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<unknown>(req, { maxBytes: MAX_IMPORT_BODY_BYTES })
    const result = await importWorkoutsForUser(userId, parseImportWorkoutsRequest(body, Date.now()))
    sendJson(res, 200, result)
  } catch (error) {
    sendApiError(res, error, { fallbackMessage: 'Could not import the workouts.', fallbackStatus: 500 })
  }
}
