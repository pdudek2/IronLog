import { adminAuth } from './firebaseAdmin.js'
import { ApiError } from './errors.js'
import { getBearerToken, type ApiRequest } from './http.js'

export async function requireUserId(req: ApiRequest): Promise<string> {
  const token = getBearerToken(req)
  if (!token) throw new ApiError(401, 'Missing authentication token.')

  try {
    const decoded = await adminAuth.verifyIdToken(token)
    if (!decoded.uid) throw new Error('Token is missing a user ID.')
    return decoded.uid
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired authentication token.', { cause: error })
  }
}
