import { adminAuth } from './firebaseAdmin.js'
import { ApiError } from './errors.js'
import { getBearerToken, type ApiRequest } from './http.js'

export async function requireUserId(req: ApiRequest): Promise<string> {
  const token = getBearerToken(req)
  if (!token) throw new ApiError(401, 'Brak tokenu autoryzacji.')

  try {
    const decoded = await adminAuth.verifyIdToken(token)
    if (!decoded.uid) throw new Error('Token bez UID.')
    return decoded.uid
  } catch (error) {
    throw new ApiError(401, 'Nieprawidłowy lub wygasły token autoryzacji.', { cause: error })
  }
}
