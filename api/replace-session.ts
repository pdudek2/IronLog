import { requireUserId } from './_lib/auth.js'
import { replaceSessionForUser } from './_lib/sessionReplacement.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendJson, sendApiError } from './_lib/http.js'
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed.' }); return }
  try {
    const uid = await requireUserId(req)
    const body = await readJsonBody(req, { maxBytes: 256 * 1024 })
    sendJson(res, 200, await replaceSessionForUser(uid, body))
  } catch (error) { sendApiError(res, error, { fallbackMessage: 'Could not replace the session.', fallbackStatus: 500 }) }
}
