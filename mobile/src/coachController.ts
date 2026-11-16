import { planRequestBody, type PlanBrief, type PlanResult, type CoachPlanRequest } from './coachPlan'
import type { AiContextMetadata } from '../../src/lib/aiContext'
import { CoachApiError, type CoachMessage, type CoachRequest } from './coachService'
import { COACH_PLAN_COST, nextUtcMidnight, type CoachQuotaUsage } from '../../src/shared/coachQuota'

export type CoachState = {
  key: string; keyLoading: boolean; keySaving: boolean; storageError: string | null
  validation: 'none' | 'checking' | 'valid' | 'invalid' | 'unverified'; keyError: string | null
  plan: PlanResult | null; planGeneration: 'idle' | 'generating' | 'interrupted' | 'failed'; planError: string | null
  messages: CoachMessage[]; partial: string; context?: AiContextMetadata
  generation: 'idle' | 'streaming' | 'interrupted' | 'failed'; error: string | null; questionId: number | null
  // The shared-key allowance; a failed read assumes the server has a key and lets it answer. `limit` holds only the
  // shared daily total, which no counter shows; the person's own limit follows `quota`.
  quota: CoachQuota | null; quotaFailed: boolean; limit: { code: string; resetAt: string } | null
}
export type CoachQuota = CoachQuotaUsage & { resetAt: string; shared: boolean }
export type CoachDependencies = {
  loadKey: () => Promise<string | null>; saveKey: (key: string) => Promise<void>
  validateKey: (key: string, signal: AbortSignal) => Promise<void>
  quota?: (signal: AbortSignal) => Promise<CoachQuota>
  plan?: (request: CoachPlanRequest) => Promise<PlanResult>
  reply: (request: CoachRequest) => Promise<string>
}

export class CoachController {
  state: CoachState = { key: '', keyLoading: true, keySaving: false, storageError: null,
    validation: 'none', keyError: null, plan: null, planGeneration: 'idle', planError: null, messages: [], partial: '', generation: 'idle', error: null, questionId: null,
    quota: null, quotaFailed: false, limit: null }
  private disposed = false
  private active = false
  private serial = 0
  private lifecycle = 0
  private keyRevision = 0
  private request: AbortController | null = null
  private validation: AbortController | null = null
  private resetTimer: ReturnType<typeof setTimeout> | null = null
  constructor(private readonly deps: CoachDependencies, private readonly publish: (state: CoachState) => void, private readonly planTimeoutMs = 90_000) {}
  private update(patch: Partial<CoachState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    if ('quota' in patch || 'limit' in patch) this.scheduleReset()
    this.publish(this.state)
  }
  // A spent allowance lifts itself at the reset time, also on a screen left open overnight.
  private scheduleReset() {
    if (this.resetTimer) clearTimeout(this.resetTimer)
    this.resetTimer = null
    const limit = this.activeLimit
    if (!limit) return
    const timer = setTimeout(() => { this.resetTimer = null; void this.loadQuota() }, Math.max(0, Date.parse(limit.resetAt) - Date.now()) + 1_000)
    ;(timer as { unref?: () => void }).unref?.()
    this.resetTimer = timer
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
      void this.loadQuota()
    } catch {
      if (revision === this.keyRevision) this.update({ keyLoading: false, storageError: 'Could not read your saved key. Retry before changing it.' })
    }
  }
  private async loadQuota() {
    if (!this.deps.quota) return
    try {
      const quota = await this.deps.quota(new AbortController().signal)
      const expired = this.state.limit && Date.now() >= Date.parse(this.state.limit.resetAt)
      this.update({ quota, quotaFailed: false, ...(expired ? { limit: null } : {}) })
    } catch { this.update({ quotaFailed: true }) }
  }
  get activeLimit(): { code: string; resetAt: string } | null {
    if (this.ownKey) return null
    if (this.state.limit && Date.now() < Date.parse(this.state.limit.resetAt)) return this.state.limit
    const quota = this.state.quota
    return quota && quota.used >= quota.limit && Date.now() < Date.parse(quota.resetAt) ? { code: 'daily-limit', resetAt: quota.resetAt } : null
  }
  get ownKey() { return !!this.state.key && this.state.validation !== 'invalid' }
  get sharedReady() { return this.state.quota ? this.state.quota.shared : this.state.quotaFailed }
  get remaining() { return this.state.quota ? Math.max(0, this.state.quota.limit - this.state.quota.used) : null }
  private get requestKey() { return this.ownKey ? this.state.key : '' }
  private noteUsage(usage: CoachQuotaUsage) {
    this.update({ quota: this.state.quota ? { ...this.state.quota, ...usage } : { ...usage, resetAt: nextUtcMidnight(Date.now()), shared: true } })
  }
  // After a failure or an abort on the shared key only the server knows what was spent.
  private failure(error: unknown) {
    if (!this.ownKey) void this.loadQuota()
    if (!(error instanceof CoachApiError)) return {}
    if (error.code === 'daily-limit-all' && error.resetAt) return { limit: { code: error.code, resetAt: error.resetAt } }
    return error.code === 'invalid-key' && this.ownKey ? { validation: 'invalid' as const } : {}
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
    } else {
      if (this.state.key && this.state.validation === 'unverified') void this.verify()
      if (changed && !this.state.keyLoading) void this.loadQuota()
    }
  }
  dispose() {
    this.setActive(false)
    if (this.resetTimer) clearTimeout(this.resetTimer)
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
    if (pending && !this.ownKey && !this.disposed) void this.loadQuota()
    if (this.state.planGeneration === 'generating') this.update({ planGeneration: 'interrupted', planError: null })
    if (this.state.generation === 'streaming') this.update({ generation: 'interrupted', partial: '', context: undefined, error: null })
  }
  reset() {
    this.cancel()
    this.update({ messages: [], partial: '', context: undefined, generation: 'idle', error: null, questionId: null })
  }
  get canSend() {
    const usable = this.ownKey ? this.state.validation !== 'checking' : this.sharedReady && !this.activeLimit
    return this.active && !this.disposed && !this.state.keySaving && !this.state.keyLoading && usable
      && this.state.generation !== 'streaming' && this.state.planGeneration !== 'generating'
  }
  get canPlan() {
    return this.canSend && (this.ownKey || this.remaining === null || this.remaining >= COACH_PLAN_COST)
  }
  captureCurrent() { const revision = this.keyRevision, lifecycle = this.lifecycle; return () => this.active && !this.disposed && revision === this.keyRevision && lifecycle === this.lifecycle }
  clearPlan() { this.cancel(); this.update({ plan: null, planError: null, planGeneration: 'idle' }) }
  async generatePlan(brief: PlanBrief) {
    if (!this.canPlan || !this.deps.plan) return
    const frozen = { ...brief, equipment: [...brief.equipment] }
    try { planRequestBody(this.requestKey, frozen) } catch (error) {
      this.update({ planError: error instanceof CoachApiError ? error.message : 'Check the workout brief.' }); return
    }
    const request = new AbortController()
    this.request = request
    const current = () => !this.disposed && this.active && this.request === request && !request.signal.aborted
    this.update({ planGeneration: 'generating', planError: null })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => { request.signal.addEventListener('abort', () => reject(new Error('Request cancelled.')), { once: true }); timer = setTimeout(() => reject(new CoachApiError('Plan generation timed out. Generating again may use another AI request.')), this.planTimeoutMs) })
    try {
      const plan = await Promise.race([this.deps.plan({ key: this.requestKey, brief: frozen, signal: request.signal }), timeout])
      if (current()) { if (plan.quota) this.noteUsage(plan.quota); this.update({ plan, planGeneration: 'idle', planError: null }) }
    } catch (error) {
      if (current()) this.update({ planGeneration: 'failed',
        planError: error instanceof CoachApiError ? error.message : 'The plan could not be completed. Generate again when ready.',
        ...this.failure(error),
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
      const content = await this.deps.reply({ key: this.requestKey, messages: this.state.messages, signal: request.signal,
        onQuota: (usage) => { if (current()) this.noteUsage(usage) },
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
        ...this.failure(error),
      })
    } finally { request.abort(); if (this.request === request) this.request = null }
  }
}
