import { adminAuth } from './firebaseAdmin.js'
import { getBearerToken, type ApiRequest } from './http.js'

export async function requireUserId(req: ApiRequest): Promise<string> {
  const token = getBearerToken(req)
  if (!token) throw new Error('Brak tokenu autoryzacji.')

  const decoded = await adminAuth.verifyIdToken(token)
  return decoded.uid
}
