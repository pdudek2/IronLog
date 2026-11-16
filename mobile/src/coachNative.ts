import { consumePlanResponse, planRequestBody } from './coachPlan'
import { fetch as expoFetch } from 'expo/fetch'
import * as SecureStore from 'expo-secure-store'
import { apiBaseUrl, currentIdToken } from './firebase'
import { CoachApiError, coachPost, coachRequestBody, consumeCoachReply } from './coachService'
import type { CoachDependencies, CoachQuota } from './coachController'

// Serialize secure storage per account so a remounted screen cannot read before an old write finishes.
const storage = new Map<string, Promise<unknown>>()
function serialized<T>(uid: string, operation: () => Promise<T>): Promise<T> {
  const pending = (storage.get(uid) ?? Promise.resolve()).catch(() => undefined).then(operation)
  storage.set(uid, pending)
  void pending.finally(() => { if (storage.get(uid) === pending) storage.delete(uid) }).catch(() => undefined)
  return pending
}
export function nativeCoachDependencies(uid: string): CoachDependencies {
  const keyName = coachKeyName(uid)
  const post = (path: 'ai-chat' | 'ai-models', body: string, signal: AbortSignal) =>
    coachPost(apiBaseUrl, path, body, signal, () => currentIdToken(uid), expoFetch as typeof fetch)
  return {
    loadKey: () => serialized(uid, () => SecureStore.getItemAsync(keyName)),
    saveKey: key => serialized(uid, () => key ? SecureStore.setItemAsync(keyName, key) : SecureStore.deleteItemAsync(keyName)),
    validateKey: async (apiKey, signal) => {
      const response = await post('ai-models', JSON.stringify({ apiKey }), signal)
      const payload = await response.json() as { models?: { id?: unknown }[] }
      // The server picks the model; any non-empty list proves the key works.
      if (!Array.isArray(payload.models) || payload.models.length === 0) {
        throw new CoachApiError('AI Coach returned no models for this key. Try again later.')
      }
    },
    quota: async signal => {
      const payload = await (await post('ai-models', JSON.stringify({ quota: true }), signal)).json() as Partial<CoachQuota>
      if (typeof payload.used !== 'number' || typeof payload.limit !== 'number' || typeof payload.resetAt !== 'string') {
        throw new CoachApiError('Could not read the Coach allowance.')
      }
      return { used: payload.used, limit: payload.limit, resetAt: payload.resetAt, shared: payload.shared === true }
    },
    plan: async request => consumePlanResponse(await post('ai-chat', planRequestBody(request.key, request.brief), request.signal), request.signal),
    reply: async request => consumeCoachReply(await post('ai-chat', coachRequestBody(request.key, request.messages), request.signal), request),
  }
}

export const coachKeyName = (uid: string) => `ironlog.coach.${Array.from(uid).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('')}`

export const removeCoachKey = (uid: string) => SecureStore.deleteItemAsync(coachKeyName(uid))
