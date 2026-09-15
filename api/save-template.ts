import { requireUserId } from './_lib/auth.js'
import { type ApiRequest, type ApiResponse, readJsonBody, sendApiError, sendJson } from './_lib/http.js'
import { parseSaveTemplateRequest, saveTemplateForUser } from './_lib/templateService.js'

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const userId = await requireUserId(req)
    const body = await readJsonBody<unknown>(req, { maxBytes: 128 * 1024 })
    const template = await saveTemplateForUser(userId, parseSaveTemplateRequest(body))
    sendJson(res, 200, { template })
  } catch (error) {
    sendApiError(res, error, { fallbackMessage: 'Could not save the template.' })
  }
}
