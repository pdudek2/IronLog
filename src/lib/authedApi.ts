import { auth } from './firebase'

export class ApiRejectedError extends Error {}

export async function callAuthedApi<T>(path: string, body: unknown, expectedUid?: string): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new Error('No active user session.')
  if (expectedUid && user.uid !== expectedUid) throw new ApiRejectedError('The user account has changed.')

  const idToken = await user.getIdToken().catch((error: unknown) => {
    throw new ApiRejectedError(error instanceof Error ? error.message : 'Could not authenticate.')
  })
  if (auth.currentUser !== user) throw new ApiRejectedError('The user account has changed.')

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null) as T | { error?: string } | null
  if (!response.ok) {
    const errorPayload = payload as { error?: string } | null
    const ErrorType = response.status >= 400 && response.status < 500 ? ApiRejectedError : Error
    throw new ErrorType(errorPayload?.error ?? 'The server operation failed.')
  }
  if (!payload) throw new Error('Invalid server response.')
  return payload as T
}
