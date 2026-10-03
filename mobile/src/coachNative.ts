import { consumePlanResponse, planRequestBody } from './coachPlan'
import { fetch as expoFetch } from 'expo/fetch'
import * as SecureStore from 'expo-secure-store'
import { apiBaseUrl, currentIdToken } from './firebase'
import { CoachApiError, coachPost, coachRequestBody, consumeCoachReply } from './coachService'
import type { CoachDependencies } from './coachController'

// Serialize secure storage per account so a remounted screen cannot read before an old write finishes.
const storage = new Map<string, Promise<unknown>>()
function serialized<T>(uid: string, operation: () => Promise<T>): Promise<T> {
  const pending = (storage.get(uid) ?? Promise.resolve()).catch(() => undefined).then(operation)
  storage.set(uid, pending)
  void pending.finally(() => { if (storage.get(uid) === pending) storage.delete(uid) }).catch(() => undefined)
  return pending
}
export function nativeCoachDependencies(uid: string): CoachDependencies {
  const keyName = `ironlog.coach.${Array.from(uid).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('')}`
  const post = (path: 'ai-chat' | 'ai-models', body: string, signal: AbortSignal) =>
    coachPost(apiBaseUrl, path, body, signal, () => currentIdToken(uid), expoFetch as typeof fetch)
  return {
    loadKey: () => serialized(uid, () => SecureStore.getItemAsync(keyName)),
    saveKey: key => serialized(uid, () => key ? SecureStore.setItemAsync(keyName, key) : SecureStore.deleteItemAsync(keyName)),
    validateKey: async (apiKey, signal) => {
      const response = await post('ai-models', JSON.stringify({ apiKey }), signal)
      const payload = await response.json() as { models?: { id?: unknown }[] }
      if (!Array.isArray(payload.models) || !payload.models.some(model => model.id === 'openai/gpt-5.6-luna')) {
        throw new CoachApiError('AI Coach returned an unsupported model. Try again later.')
      }
    },
    plan: async request => consumePlanResponse(await post('ai-chat', planRequestBody(request.key, request.brief), request.signal), request.signal),
    reply: async request => consumeCoachReply(await post('ai-chat', coachRequestBody(request.key, request.messages), request.signal), request),
  }
}
