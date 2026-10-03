import { planRequestBody, type PlanBrief, type PlanResult, type CoachPlanRequest } from './coachPlan'
import type { AiContextMetadata } from '../../src/lib/aiContext'
import { CoachApiError, type CoachMessage, type CoachRequest } from './coachService'

export type CoachState = {
  key: string; keyLoading: boolean; keySaving: boolean; storageError: string | null
  validation: 'none' | 'checking' | 'valid' | 'invalid' | 'unverified'; keyError: string | null
  plan: PlanResult | null; planGeneration: 'idle' | 'generating' | 'interrupted' | 'failed'; planError: string | null
  messages: CoachMessage[]; partial: string; context?: AiContextMetadata
  generation: 'idle' | 'streaming' | 'interrupted' | 'failed'; error: string | null; questionId: number | null
}
export type CoachDependencies = {
  loadKey: () => Promise<string | null>; saveKey: (key: string) => Promise<void>
  validateKey: (key: string, signal: AbortSignal) => Promise<void>
  plan?: (request: CoachPlanRequest) => Promise<PlanResult>
  reply: (request: CoachRequest) => Promise<string>
}

export class CoachController {
  state: CoachState = { key: '', keyLoading: true, keySaving: false, storageError: null,
    validation: 'none', keyError: null, plan: null, planGeneration: 'idle', planError: null, messages: [], partial: '', generation: 'idle', error: null, questionId: null }
  private disposed = false
  private active = false
  private serial = 0
  private lifecycle = 0
  private keyRevision = 0
  private request: AbortController | null = null
  private validation: AbortController | null = null
  constructor(private readonly deps: CoachDependencies, private readonly publish: (state: CoachState) => void, private readonly planTimeoutMs = 90_000) {}
  private update(patch: Partial<CoachState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.publish(this.state)
  }
  async load() {
    if (this.disposed) return
    const revision = ++this.keyRevision
    this.update({ keyLoading: true, storageError: null })
    try {
      const key = await this.deps.loadKey() ?? ''
      if (this.disposed || revision !== this.keyRevision) return
      this.update({ key, keyLoading: false, validation: key ? 'unverified' : 'none' })
      if (this.active && key) void this.verify()
    } catch {
      if (revision === this.keyRevision) this.update({ keyLoading: false, storageError: 'Could not read your saved key. Retry before changing it.' })
    }
  }
  setActive(active: boolean) {
    const changed = this.active !== active
    this.active = active
    if (changed) this.update({})
    if (!active) {
      this.cancel()
      this.validation?.abort()
      this.validation = null
      if (this.state.validation === 'checking') this.update({ validation: 'unverified' })
    } else if (this.state.key && this.state.validation === 'unverified') void this.verify()
  }
  dispose() {
    this.setActive(false)
    this.disposed = true
    this.keyRevision++
    this.state = { ...this.state, key: '', messages: [], partial: '', context: undefined, plan: null }
  }
  async saveKey(raw: string) {
    if (this.disposed || this.state.keySaving || this.state.keyLoading || this.state.storageError) return false
    const key = raw.trim()
    if (key && (key.length < 20 || key.length > 4096)) {
      this.update({ keyError: 'Paste a complete OpenRouter key (20–4096 characters).' })
      return false
    }
    this.cancel()
    this.validation?.abort()
    this.validation = null
    const revision = ++this.keyRevision
    this.update({ keySaving: true, keyError: null, validation: this.state.key ? 'unverified' : 'none' })
    try {
      await this.deps.saveKey(key)
      if (this.disposed || revision !== this.keyRevision) return false
      this.update({ key, keySaving: false, validation: key ? 'unverified' : 'none' })
      if (this.active && key) void this.verify()
      return true
    } catch {
      if (revision === this.keyRevision) this.update({ keySaving: false, keyError: 'Could not save the key securely. Your previous key is unchanged.' })
      return false
    }
  }
  async verify() {
    if (!this.active || this.disposed || !this.state.key || this.state.keySaving) return
    this.validation?.abort()
    const request = new AbortController()
    this.validation = request
    const key = this.state.key
    this.update({ validation: 'checking', keyError: null })
    try {
      await this.deps.validateKey(key, request.signal)
      if (!request.signal.aborted && this.validation === request) this.update({ validation: 'valid' })
    } catch (error) {
      if (!request.signal.aborted && this.validation === request) this.update({
        validation: error instanceof CoachApiError && error.code === 'invalid-key' ? 'invalid' : 'unverified',
        keyError: error instanceof Error ? error.message : 'Could not verify the key. Try again.',
      })
    } finally { if (this.validation === request) this.validation = null }
  }
  cancel() {
    this.lifecycle++
    const pending = this.request
    this.request = null
    pending?.abort()
    if (this.state.planGeneration === 'generating') this.update({ planGeneration: 'interrupted', planError: null })
    if (this.state.generation === 'streaming') this.update({ generation: 'interrupted', partial: '', context: undefined, error: null })
  }
  reset() {
    this.cancel()
    this.update({ messages: [], partial: '', context: undefined, generation: 'idle', error: null, questionId: null })
  }
  get canSend() {
    return this.active && !this.disposed && !!this.state.key && !this.state.keySaving && !this.state.keyLoading
      && this.state.validation !== 'invalid' && this.state.validation !== 'checking' && this.state.generation !== 'streaming' && this.state.planGeneration !== 'generating'
  }
  captureCurrent() { const revision = this.keyRevision, lifecycle = this.lifecycle; return () => this.active && !this.disposed && revision === this.keyRevision && lifecycle === this.lifecycle }
  clearPlan() { this.cancel(); this.update({ plan: null, planError: null, planGeneration: 'idle' }) }
  async generatePlan(brief: PlanBrief) {
    if (!this.canSend || !this.deps.plan) return
    const frozen = { ...brief, equipment: [...brief.equipment] }
    try { planRequestBody(this.state.key, frozen) } catch (error) {
      this.update({ planError: error instanceof CoachApiError ? error.message : 'Check the workout brief.' }); return
    }
    const request = new AbortController()
    this.request = request
    const current = () => !this.disposed && this.active && this.request === request && !request.signal.aborted
    this.update({ planGeneration: 'generating', planError: null })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { request.signal.addEventListener('abort', () => reject(new Error('Request cancelled.')), { once: true }); timer = setTimeout(() => reject(new CoachApiError('Plan generation timed out. Generating again may use another AI request.')), this.planTimeoutMs) })
    try {
      const plan = await Promise.race([this.deps.plan({ key: this.state.key, brief: frozen, signal: request.signal }), timeout])
      if (current()) this.update({ plan, planGeneration: 'idle', planError: null })
    } catch (error) {
      if (current()) this.update({ planGeneration: 'failed',
        planError: error instanceof CoachApiError ? error.message : 'The plan could not be completed. Generate again when ready.',
        ...(error instanceof CoachApiError && error.code === 'invalid-key' ? { validation: 'invalid' as const } : {}),
      })
    } finally { clearTimeout(timer); request.abort(); if (this.request === request) this.request = null }
  }
  send(raw: string) {
    const content = raw.trim().slice(0, 4000)
    if (!content || !this.canSend) return false
    const question: CoachMessage = { id: ++this.serial, role: 'user', content }
    this.update({ messages: [...this.state.messages, question], questionId: question.id })
    void this.generate(question.id)
    return true
  }
  retry() {
    if (!this.canSend || this.state.questionId === null || !['interrupted', 'failed'].includes(this.state.generation)) return
    void this.generate(this.state.questionId)
  }
  private async generate(questionId: number) {
    const request = new AbortController()
    this.request = request
    const current = () => !this.disposed && this.active && this.request === request && !request.signal.aborted
    let context: AiContextMetadata | undefined
    this.update({ generation: 'streaming', error: null, partial: '', context: undefined })
    try {
      const content = await this.deps.reply({ key: this.state.key, messages: this.state.messages, signal: request.signal,
        onContext: (value) => { if (current()) { context = value; this.update({ context }) } },
        onChunk: (text) => { if (current()) this.update({ partial: this.state.partial + text }) },
      })
      if (!current()) return
      this.update({ messages: [...this.state.messages, { id: ++this.serial, role: 'assistant', content, context }],
        generation: 'idle', partial: '', context: undefined, questionId: null })
    } catch (error) {
      if (!current()) return
      this.update({ generation: 'failed', partial: '', context: undefined, questionId,
        error: error instanceof CoachApiError ? error.message : 'The response could not be completed. Retry when ready.',
        ...(error instanceof CoachApiError && error.code === 'invalid-key' ? { validation: 'invalid' as const } : {}),
      })
    } finally { request.abort(); if (this.request === request) this.request = null }
  }
}
