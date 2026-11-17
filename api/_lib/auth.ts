import { adminAuth } from './firebaseAdmin.js'
import { ApiError } from './errors.js'
import { getBearerToken, type ApiRequest } from './http.js'

export async function requireUserId(req: ApiRequest, options: { checkRevoked?: boolean } = {}): Promise<string> {
  const token = getBearerToken(req)
  if (!token) throw new ApiError(401, 'Missing authentication token.')

  try {
    const decoded = await adminAuth.verifyIdToken(token, options.checkRevoked === true)
    if (!decoded.uid) throw new Error('Token is missing a user ID.')
    return decoded.uid
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired authentication token.', { cause: error })
  }
}

const RECENT_SIGN_IN_SECONDS = 5 * 60

// Deleting an account needs a token from a sign-in in the last five minutes that has not been revoked.
export async function requireRecentUserId(req: ApiRequest, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const token = getBearerToken(req)
  if (!token) throw new ApiError(401, 'Missing authentication token.')
  let decoded: { uid?: string; auth_time?: number }
  try {
    decoded = await adminAuth.verifyIdToken(token, true)
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired authentication token.', { cause: error })
  }
  if (!decoded.uid) throw new ApiError(401, 'Invalid or expired authentication token.')
  if (typeof decoded.auth_time !== 'number' || nowSeconds - decoded.auth_time > RECENT_SIGN_IN_SECONDS) {
    throw new ApiError(403, 'Sign in again to delete your account.')
  }
  return decoded.uid
}
