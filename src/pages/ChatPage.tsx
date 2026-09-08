import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type * as React from 'react'
import { Bot, LoaderCircle, RotateCcw, Send, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import AiKeyPanel from '../components/AiKeyPanel'
import ChatMarkdown from '../components/ChatMarkdown'
import { Button } from '../components/ui'
import { getOpenRouterApiKey, hasOpenRouterApiKey } from '../lib/aiKeyStorage'
import { createTemplate } from '../lib/templateService'
import { saveTemplateDraft } from '../lib/templateDraftStorage'
import {
  generateTrainingPlan,
  streamChatReply,
  type AiContextSource,
  type ChatMessage,
  type GeneratedTrainingPlan,
} from '../lib/chatService'
import { useAuthStore } from '../store/authStore'

const STARTER_PROMPTS = [
  'Analyze my last week of training.',
  'What should I focus on in my next upper body workout?',
  'Does my readiness suggest a harder or lighter session today?',
]

const STARTER_PROMPT_LABELS: Record<string, string> = {
  'Analyze my last week of training.': 'Summarize my week',
  'What should I focus on in my next upper body workout?': 'Next upper body',
  'Does my readiness suggest a harder or lighter session today?': 'Readiness today',
}

const MISSING_PLAN_KEY_MESSAGE = 'Add a OpenRouter API key to unlock the plan generator.'

const DEMO_EMAIL = 'demo@ironlog.app'

const DEMO_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'demo-msg-1',
    role: 'user',
    content: 'Analyze my last week of training.',
  },
  {
    id: 'demo-msg-2',
    role: 'assistant',
    content: `You completed **3 full sessions** this week (Upper A, Lower A, Upper B) — a solid training week.

**Highlights:**
- **Bench Press**: 72.5 kg × 8, 8, 7, 6 — a new working-set PR
- **Squat**: 100 kg × 6, 6, 5, 5 — your first three-digit weight
- **OHP**: 50 kg × 6, 5, 5 — steady progress

**Readiness** over the last 7 days: sleep averaged 4/5, soreness 2/5. You look ready to progress.

**For tomorrow (Lower B):**
- Deadlift **122.5 kg** for your top set, with careful attention to technique
- Keep Bulgarian Split Squats unchanged
- Maintain your core volume — it has dropped recently.`,
  },
  {
    id: 'demo-msg-3',
    role: 'user',
    content: 'What about my OHP plateau? I have been stuck at 50 kg for two weeks.',
  },
  {
    id: 'demo-msg-4',
    role: 'assistant',
    content: `An OHP plateau around 45–55 kg is common. A few factors may contribute:

1. **Limited accessory work** for rear delts and triceps
2. **Lockout strength** — more overhead volume may help
3. **Recovery** — OHP can be sensitive to poor sleep

**A 3-week plan:**
- **Week 1 (deload)**: OHP 42.5 kg 3×8 with controlled reps
- **Week 2 (intensity)**: OHP 47.5 kg 5×3 + **Face Pull 4×15** after each upper body session
- **Week 3 (PR attempt)**: 3 warm-up sets → 52.5 kg × 3–5

Add **Seated DB Press 3×10** after OHP for accessory volume. Adjust if recovery or comfort suffers.

Check back after a week and let me know how it goes.`,
  },
]

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

const EQUIPMENT_OPTIONS = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'cable', label: 'Cable' },
  { value: 'machine', label: 'Machines' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
]

const CONTEXT_SOURCE_LABELS: Record<AiContextSource, string> = {
  profile: 'profile',
  readiness: 'readiness',
  workouts: 'workouts',
  records: 'records',
}
const contextList = new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' })

type AiWorkspaceTab = 'chat' | 'plan'

interface PlanErrorState {
  message: string
  field: 'goal' | null
}

type ChatGenerationState =
  | { status: 'idle' }
  | { status: 'streaming'; questionId: string }
  | { status: 'interrupted'; questionId: string }
  | { status: 'failed'; questionId: string; message: string }

type ChatCancelReason = 'reset' | 'mode-change' | 'unmount' | 'superseded'

interface ActiveChatGeneration {
  generationId: string
  questionId: string
  controller: AbortController
  cancelReason: ChatCancelReason | null
}

function SectionError({ message, id }: { message: string; id?: string }) {
  return (
    <div
      id={id}
      role="alert"
      className="rounded-[var(--radius-lg)] border px-4 py-3 text-sm"
      style={{
        background: 'var(--danger-soft)',
        borderColor: 'var(--danger-soft-strong)',
        color: 'var(--danger)',
      }}
    >
      {message}
    </div>
  )
}

function ContextAvailabilityNotice({
  subject,
  unavailableSources,
}: {
  subject: 'Response' | 'Plan'
  unavailableSources: AiContextSource[]
}) {
  if (unavailableSources.length === 0) return null
  const labels = unavailableSources.map((source) => CONTEXT_SOURCE_LABELS[source])
  return (
    <div className="coach-generation-feedback" role="status">
      {subject} was created with some data unavailable: {contextList.format(labels)}.
    </div>
  )
}

export default function ChatPage() {
  const { user, loading } = useAuthStore()
  const keyOwnerUid = !loading && !user?.isAnonymous ? user?.uid ?? null : null
  const navigate = useNavigate()
  const isDemoUser = user?.email === DEMO_EMAIL
  const [activeTab, setActiveTab] = useState<AiWorkspaceTab>('chat')
  const [keyConfiguration, setKeyConfiguration] = useState(() => ({
    uid: keyOwnerUid,
    configured: hasOpenRouterApiKey(),
  }))
  const configured = keyOwnerUid !== null && (keyConfiguration.uid === keyOwnerUid
    ? keyConfiguration.configured
    : hasOpenRouterApiKey())
  const setConfigured = useCallback((nextConfigured: boolean) => {
    setKeyConfiguration({ uid: keyOwnerUid, configured: nextConfigured })
  }, [keyOwnerUid])
  const [showConfigPanel, setShowConfigPanel] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => (isDemoUser ? DEMO_CHAT_MESSAGES : []))
  const demoSeededRef = useRef(isDemoUser)
  const [input, setInput] = useState('')
  const [streamText, setStreamText] = useState('')
  const [streamUnavailableSources, setStreamUnavailableSources] = useState<AiContextSource[]>([])
  const [generationState, setGenerationState] = useState<ChatGenerationState>({ status: 'idle' })
  const activeGenerationRef = useRef<ActiveChatGeneration | null>(null)
  const [error, setError] = useState('')

  const [planGoal, setPlanGoal] = useState('')
  const [planDays, setPlanDays] = useState(3)
  const [planExperience, setPlanExperience] = useState('intermediate')
  const [planFocus, setPlanFocus] = useState('')
  const [planNotes, setPlanNotes] = useState('')
  const [planEquipment, setPlanEquipment] = useState<string[]>(['barbell', 'dumbbell', 'bodyweight'])
  const [planPreview, setPlanPreview] = useState<GeneratedTrainingPlan | null>(null)
  const [planUnavailableSources, setPlanUnavailableSources] = useState<AiContextSource[]>([])
  const [planError, setPlanError] = useState<PlanErrorState | null>(null)
  const planGoalRef = useRef<HTMLInputElement>(null)
  const planGoalId = useId()
  const planErrorId = useId()
  const keyPanelId = useId()
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [selectedPreviewDay, setSelectedPreviewDay] = useState(0)
  const chatContainerRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)

  const previewDay = planPreview?.days[selectedPreviewDay] ?? null
  const totalPlanExercises = planPreview?.days.reduce((sum, day) => sum + day.exercises.length, 0) ?? 0
  const sending = generationState.status === 'streaming'
  const hasConversation = messages.length > 0 || streamText.length > 0
  const experienceLabel = EXPERIENCE_OPTIONS.find((option) => option.value === planExperience)?.label ?? planExperience

  function cancelActiveGeneration(reason: ChatCancelReason, updateUi = true) {
    const active = activeGenerationRef.current
    activeGenerationRef.current = null

    if (active) {
      active.cancelReason = reason
      active.controller.abort(reason)
    }

    if (!updateUi) return

    setStreamText('')
    setStreamUnavailableSources([])
    if (reason === 'mode-change' && active) {
      setGenerationState({ status: 'interrupted', questionId: active.questionId })
      return
    }
    setGenerationState({ status: 'idle' })
  }

  function clearActiveGeneration(generationId: string) {
    if (activeGenerationRef.current?.generationId !== generationId) return
    activeGenerationRef.current = null
  }

  function getChatActionApiKey(): string | null {
    const apiKey = getOpenRouterApiKey()
    if (configured && apiKey) return apiKey

    cancelActiveGeneration('superseded')
    setConfigured(false)
    setError('Add a OpenRouter API key to use AI Coach.')
    return null
  }

  useEffect(() => {
    if (!isDemoUser || demoSeededRef.current) return
    demoSeededRef.current = true
    setMessages(DEMO_CHAT_MESSAGES)
  }, [isDemoUser])

  useEffect(() => {
    const chatContainer = chatContainerRef.current
    if (!chatContainer || !shouldStickToBottomRef.current) return
    chatContainer.scrollTop = chatContainer.scrollHeight
  }, [messages, streamText])

  useEffect(() => () => {
    const active = activeGenerationRef.current
    activeGenerationRef.current = null
    if (active) {
      active.cancelReason = 'unmount'
      active.controller.abort('unmount')
    }
  }, [])

  async function runChatGeneration(requestMessages: ChatMessage[], questionId: string, apiKey: string) {
    cancelActiveGeneration('superseded', false)

    const generationId = crypto.randomUUID()
    const controller = new AbortController()
    activeGenerationRef.current = {
      generationId,
      questionId,
      controller,
      cancelReason: null,
    }

    setGenerationState({ status: 'streaming', questionId })
    setError('')
    setStreamText('')
    setStreamUnavailableSources([])

    let generationUnavailableSources: AiContextSource[] = []

    try {
      const reply = await streamChatReply({
        apiKey,
        messages: requestMessages.map(({ role, content }) => ({ role, content })),
        signal: controller.signal,
        onContext: (context) => {
          if (activeGenerationRef.current?.generationId !== generationId) return
          generationUnavailableSources = context.unavailableSources
          setStreamUnavailableSources(context.unavailableSources)
        },
        onChunk: (chunk) => {
          if (activeGenerationRef.current?.generationId !== generationId) return
          setStreamText((current) => current + chunk)
        },
      })

      if (activeGenerationRef.current?.generationId !== generationId) return
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply || 'Could not generate a response.',
          contextUnavailableSources: generationUnavailableSources,
        },
      ])
      setStreamText('')
      setStreamUnavailableSources([])
      setGenerationState({ status: 'idle' })
    } catch (nextError) {
      if (activeGenerationRef.current?.generationId !== generationId) return
      if (controller.signal.aborted || (nextError instanceof Error && nextError.name === 'AbortError')) {
        setStreamText('')
        setStreamUnavailableSources([])
        setGenerationState({ status: 'interrupted', questionId })
        return
      }

      const message = nextError instanceof Error ? nextError.message : 'Could not connect to AI Coach.'
      setStreamText('')
      setStreamUnavailableSources([])
      setGenerationState({ status: 'failed', questionId, message })
    } finally {
      clearActiveGeneration(generationId)
    }
  }

  async function handleSend(rawPrompt?: string) {
    const prompt = (rawPrompt ?? input).trim()
    if (!prompt || sending) return

    const apiKey = getChatActionApiKey()
    if (!apiKey) return

    shouldStickToBottomRef.current = true
    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
      },
    ]
    const questionId = nextMessages[nextMessages.length - 1].id

    setMessages(nextMessages)
    setInput('')
    await runChatGeneration(nextMessages, questionId, apiKey)
  }

  function handleRetry() {
    if (generationState.status !== 'interrupted' && generationState.status !== 'failed') return
    const { questionId } = generationState
    if (!messages.some((message) => message.id === questionId && message.role === 'user')) return
    const apiKey = getChatActionApiKey()
    if (!apiKey) return
    void runChatGeneration(messages, questionId, apiKey)
  }

  function handleModeChange(nextTab: AiWorkspaceTab) {
    if (activeTab === 'chat' && nextTab !== 'chat' && generationState.status === 'streaming') {
      cancelActiveGeneration('mode-change')
    }
    setActiveTab(nextTab)
  }

  function handleReset() {
    cancelActiveGeneration('reset')
    setMessages([])
    setStreamText('')
    setError('')
  }

  function handleChatScroll() {
    const chatContainer = chatContainerRef.current
    if (!chatContainer) return

    const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight
    shouldStickToBottomRef.current = distanceFromBottom < 96
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSend()
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void handleSend()
  }

  function toggleEquipment(value: string) {
    setPlanEquipment((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ))
  }

  async function handleGeneratePlan() {
    const apiKey = getOpenRouterApiKey()
    if (!apiKey) {
      setConfigured(false)
      setPlanError({ message: MISSING_PLAN_KEY_MESSAGE, field: null })
      return
    }

    if (planGoal.trim().length < 2) {
      setPlanError({ message: 'Enter a plan goal before starting the generator.', field: 'goal' })
      planGoalRef.current?.focus()
      return
    }

    setPlanError(null)
    setPlanPreview(null)
    setPlanUnavailableSources([])
    setGeneratingPlan(true)

    try {
      const { plan, context } = await generateTrainingPlan({
        apiKey,
        request: {
          goal: planGoal,
          daysPerWeek: planDays,
          experience: planExperience,
          equipment: planEquipment,
          focus: planFocus,
          notes: planNotes,
        },
      })

      setSelectedPreviewDay(0)
      setPlanPreview(plan)
      setPlanUnavailableSources(context.unavailableSources)
      toast.success('Plan generated. You can save it as a template.')
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Could not generate a plan.'
      setPlanError({ message, field: null })
      setPlanPreview(null)
      setPlanUnavailableSources([])
    } finally {
      setGeneratingPlan(false)
    }
  }

  async function handleSaveGeneratedPlan() {
    if (!user || !planPreview) return

    setSavingPlan(true)

    try {
      await createTemplate(user.uid, {
        name: planPreview.name,
        days: planPreview.days,
      })
      toast.success('Plan saved as a new template.')
      setPlanPreview(null)
      setPlanUnavailableSources([])
      setPlanGoal('')
      setPlanFocus('')
      setPlanNotes('')
      setPlanError(null)
    } catch {
      setPlanError({ message: 'Could not save the generated plan.', field: null })
    } finally {
      setSavingPlan(false)
    }
  }

  function handleEditGeneratedPlan() {
    if (!planPreview) return

    saveTemplateDraft({
      name: planPreview.name,
      days: planPreview.days,
    })

    navigate('/templates/new?draft=ai')
  }

  const handleGateConfiguredChange = useCallback((nextConfigured: boolean) => {
    setConfigured(nextConfigured)
    if (nextConfigured) {
      setError('')
      setPlanError((current) => current?.message === MISSING_PLAN_KEY_MESSAGE ? null : current)
      setShowConfigPanel(false)
      return
    }
    setShowConfigPanel(hasOpenRouterApiKey())
  }, [setConfigured])

  const handleRailConfiguredChange = useCallback((nextConfigured: boolean) => {
    setConfigured(nextConfigured)
    if (nextConfigured) setError('')
    if (!nextConfigured) {
      setShowConfigPanel(false)
    }
  }, [setConfigured])

  return (
    <>
      <section className="coach-header">
        <motion.div
          className="coach-header-copy"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <h1>Coach</h1>
          <p>Ask about your last session or build a plan.</p>
        </motion.div>
      </section>

      <div className="ai-workspace coach-workspace">
        <section className="coach-mode-switch" role="group" aria-label="AI Coach mode">
            {[
              {
                key: 'chat' as const,
                title: 'Chat',
                desc: 'Discuss your last session or next workout.',
              },
              {
                key: 'plan' as const,
                title: 'Plan',
                desc: 'Build a plan and save it in the app.',
              },
            ].map((tab) => {
              const active = activeTab === tab.key

              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleModeChange(tab.key)}
                  className="coach-mode-button"
                  data-active={active}
                >
                  <strong>{tab.title}</strong>
                  <span>{tab.desc}</span>
                </button>
              )
            })}
        </section>

        <div
          className="coach-workspace-grid"
          data-has-rail={configured || Boolean(planPreview)}
        >
          <div className="coach-main-flow">
            {!configured && !showConfigPanel && (
              <>
                <section className="coach-key-gate">
                  <div>
                    <strong>Add a local OpenRouter key</strong>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                      Without it, you can review the conversation and brief, but cannot send questions or generate plans.
                    </p>
                  </div>
                  <div className="mt-4">
                    <Button
                      type="button"
                      aria-expanded={showConfigPanel}
                      aria-controls={keyPanelId}
                      onClick={() => setShowConfigPanel((current) => !current)}
                    >
                      Set up key
                    </Button>
                  </div>
                </section>
              </>
            )}

            {!configured && showConfigPanel && (
              <>
                <AiKeyPanel
                  id={keyPanelId}
                  onConfiguredChange={handleGateConfiguredChange}
                  onExpand={() => setShowConfigPanel(true)}
                  onCollapse={() => setShowConfigPanel(false)}
                />
              </>
            )}

            {activeTab === 'chat' ? (
              <>
                <section className="coach-chat-panel">
                  {hasConversation && (
                    <div className="coach-panel-head">
                      <div aria-hidden="true" />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleReset}
                        className="coach-reset-button inline-flex items-center gap-2"
                      >
                        <RotateCcw size={14} />
                        Reset
                      </Button>
                    </div>
                  )}

                  <div
                    className={`coach-thread ${messages.length === 0 && !streamText ? 'coach-thread--empty' : ''}`}
                    aria-label="Chat with AI Coach"
                    aria-busy={sending}
                  >
                    {messages.length === 0 && !streamText ? (
                      <div className="coach-empty-thread">
                        <div>
                          <div className="coach-empty-icon">
                            <Bot size={24} />
                          </div>
                          <p>{configured ? 'Ask a question or choose a shortcut.' : 'No conversation history'}</p>
                          <span>
                            {configured
                              ? 'Ask about your week, next workout, readiness or an exercise plateau.'
                              : 'Your analysis and follow-up questions will appear here.'}
                          </span>
                        </div>

                        {configured && (
                          <div className="coach-empty-prompts">
                            {STARTER_PROMPTS.map((prompt) => (
                              <button
                                key={prompt}
                                type="button"
                                onClick={() => void handleSend(prompt)}
                                disabled={sending}
                                className="coach-prompt-button"
                                aria-label={prompt}
                              >
                                <span className="coach-prompt-full">{prompt}</span>
                                <span className="coach-prompt-short">{STARTER_PROMPT_LABELS[prompt] ?? prompt}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        ref={chatContainerRef}
                        onScroll={handleChatScroll}
                        className="coach-thread-scroll no-scrollbar"
                        role="log"
                        aria-live={sending ? 'off' : 'polite'}
                        aria-relevant="additions"
                      >
                        <div className="coach-message-list">
                          {messages.map((message) => (
                            <div
                              key={message.id}
                              className="coach-message"
                              data-role={message.role}
                            >
                              <p>
                                {message.role === 'assistant' ? 'AI Coach' : 'You'}
                              </p>
                              <ChatMarkdown content={message.content} />
                              {message.role === 'assistant' && (
                                <ContextAvailabilityNotice
                                  subject="Response"
                                  unavailableSources={message.contextUnavailableSources ?? []}
                                />
                              )}
                            </div>
                          ))}

                          {sending && !streamText && (
                            <div className="coach-message" data-role="assistant">
                              <p>AI Coach</p>
                              <div className="flex items-center gap-3">
                                <div className="chat-typing-indicator" aria-hidden="true">
                                  <span className="chat-typing-dot" />
                                  <span className="chat-typing-dot" />
                                  <span className="chat-typing-dot" />
                                </div>
                                <span className="coach-thinking">Analyzing context...</span>
                              </div>
                              <ContextAvailabilityNotice
                                subject="Response"
                                unavailableSources={streamUnavailableSources}
                              />
                            </div>
                          )}

                          {streamText && (
                            <div className="coach-message" data-role="assistant">
                              <p>AI Coach</p>
                              <div className="flex items-end gap-1">
                                <div className="min-w-0 flex-1">
                                  <ChatMarkdown content={streamText} />
                                  <ContextAvailabilityNotice
                                    subject="Response"
                                    unavailableSources={streamUnavailableSources}
                                  />
                                </div>
                                <span className="chat-stream-cursor" aria-hidden="true" />
                              </div>
                            </div>
                          )}
                          <div />
                        </div>
                      </div>
                    )}
                  </div>

                  {generationState.status === 'interrupted' && (
                    <div className="coach-generation-feedback" role="status" aria-live="polite">
                      <span>Generation stopped.</span>
                      <Button type="button" variant="ghost" onClick={handleRetry}>
                        Retry AI response
                      </Button>
                    </div>
                  )}

                  {generationState.status === 'failed' && (
                    <div className="coach-generation-feedback coach-generation-feedback--error" role="alert">
                      <span>{generationState.message}</span>
                      <Button type="button" variant="ghost" onClick={handleRetry}>
                        Retry AI response
                      </Button>
                    </div>
                  )}

                  {error && <SectionError message={error} />}

                  {configured && (
                    <form onSubmit={handleSubmit} className="coach-composer">
                    <textarea
                      aria-label="Message AI Coach"
                      value={input}
                      onChange={(event) => {
                        setInput(event.target.value)
                        const el = event.target
                        el.style.height = 'auto'
                        el.style.height = `${Math.min(el.scrollHeight, 160)}px`
                      }}
                      onKeyDown={handleComposerKeyDown}
                      placeholder="Ask about progress, a plan or your last session"
                      disabled={!configured || sending}
                      rows={2}
                      className="coach-composer-input"
                    />

                    <div className="coach-composer-footer">
                      <p>Responses are billed to your OpenRouter API key.</p>

                      <Button
                        type="submit"
                        disabled={!configured || !input.trim() || sending}
                        onPointerDown={(event) => event.preventDefault()}
                        className="inline-flex items-center gap-2"
                      >
                        {sending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
                        {sending ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                    </form>
                  )}
                </section>
              </>
            ) : (
              <>
                <section className="coach-plan-panel">
                  <div className="coach-panel-head">
                    <h2>Workout brief</h2>
                  </div>

                  <div className="coach-plan-form">
                    <div className="coach-field md:col-span-2">
                      <label htmlFor={planGoalId} className="stat-meta">Plan goal</label>
                      <input
                        id={planGoalId}
                        ref={planGoalRef}
                        type="text"
                        value={planGoal}
                        onChange={(event) => {
                          setPlanGoal(event.target.value)
                          if (planError?.field === 'goal') setPlanError(null)
                        }}
                        aria-invalid={planError?.field === 'goal' ? true : undefined}
                        aria-describedby={planError?.field === 'goal' ? planErrorId : undefined}
                        placeholder="E.g. upper/lower strength plan"
                      />
                      {planError?.field === 'goal' && (
                        <p id={planErrorId} role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
                          {planError.message}
                        </p>
                      )}
                    </div>

                    <div className="coach-field">
                      <span className="stat-meta">Days per week</span>
                      <div className="coach-chip-row" role="group" aria-label="Training days per week">
                        {[2, 3, 4, 5, 6].map((days) => (
                          <button
                            key={days}
                            type="button"
                            aria-pressed={planDays === days}
                            onClick={() => setPlanDays(days)}
                            className="mobile-touch-target rounded-[var(--radius-pill)] border px-3 py-2 text-sm font-semibold transition"
                            style={{
                              background: planDays === days ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                              borderColor: planDays === days ? 'var(--accent-soft-strong)' : 'var(--border)',
                              color: planDays === days ? 'var(--accent)' : 'var(--muted)',
                            }}
                          >
                            {days} days
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="coach-field">
                      <span className="stat-meta">Level</span>
                      <div className="coach-choice-stack" role="group" aria-label="Experience level">
                        {EXPERIENCE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={planExperience === option.value}
                            onClick={() => setPlanExperience(option.value)}
                            className="coach-choice-option mobile-touch-target"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="coach-field md:col-span-2">
                      <span className="stat-meta">Available equipment</span>
                      <div className="coach-chip-row" role="group" aria-label="Available equipment">
                        {EQUIPMENT_OPTIONS.map((option) => {
                          const active = planEquipment.includes(option.value)
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleEquipment(option.value)}
                              className="mobile-touch-target rounded-[var(--radius-pill)] border px-3 py-2 text-sm font-semibold transition"
                              style={{
                                background: active ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                                borderColor: active ? 'var(--accent-soft-strong)' : 'var(--border)',
                                color: active ? 'var(--accent)' : 'var(--muted)',
                              }}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <label className="coach-field">
                      <span className="stat-meta">Focus</span>
                      <input
                        type="text"
                        value={planFocus}
                        onChange={(event) => setPlanFocus(event.target.value)}
                        placeholder="E.g. bench press and back"
                      />
                    </label>

                    <label className="coach-field">
                      <span className="stat-meta">Additional notes</span>
                      <textarea
                        value={planNotes}
                        onChange={(event) => setPlanNotes(event.target.value)}
                        rows={4}
                        placeholder="E.g. 60 min, no deadlifts"
                      />
                    </label>
                  </div>

                  {planError && planError.field === null && (
                    <div className="mt-4">
                      <SectionError id={planErrorId} message={planError.message} />
                    </div>
                  )}

                  <div className="coach-plan-actions">
                    <p>Coach adds your profile, history and exercise library to the brief.</p>

                    <Button
                      type="button"
                      onClick={() => void handleGeneratePlan()}
                      disabled={!configured || generatingPlan}
                      className="inline-flex items-center gap-2"
                    >
                      {generatingPlan ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
                      {generatingPlan ? 'Generating plan...' : 'Generate plan'}
                    </Button>
                  </div>
                </section>

                {planPreview && (
                  <section className="coach-plan-preview">
                    <div className="coach-plan-preview-head">
                      <div>
                        <p>Plan preview</p>
                        <h2>{planPreview.name}</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                          {planPreview.summary}
                        </p>
                      </div>

                      <div className="coach-preview-stats">
                        {[
                          { label: 'Days', value: String(planPreview.days.length) },
                          { label: 'Exercises', value: String(totalPlanExercises) },
                          { label: 'Level', value: experienceLabel },
                        ].map((metric) => (
                          <div
                            key={metric.label}
                            className="coach-preview-stat"
                          >
                            <p className="stat-meta">{metric.label}</p>
                            <p className="mt-2 text-xl font-semibold text-white">{metric.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <ContextAvailabilityNotice
                      subject="Plan"
                      unavailableSources={planUnavailableSources}
                    />

                    <div className="coach-chip-row mt-5" role="group" aria-label="Plan preview day">
                      {planPreview.days.map((day, index) => (
                        <button
                          key={`${day.name}-${index}`}
                          type="button"
                          aria-pressed={selectedPreviewDay === index}
                          onClick={() => setSelectedPreviewDay(index)}
                          className="mobile-touch-target rounded-[var(--radius-pill)] border px-3 py-2 text-sm font-semibold transition"
                          style={{
                            background: selectedPreviewDay === index ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                            borderColor: selectedPreviewDay === index ? 'var(--accent-soft-strong)' : 'var(--border)',
                            color: selectedPreviewDay === index ? 'var(--accent)' : 'var(--muted)',
                          }}
                        >
                          {day.name}
                        </button>
                      ))}
                    </div>

                    {previewDay && (
                      <div className="coach-preview-day">
                        <div className="flex items-center justify-between gap-3 border-b px-4 py-4" style={{ borderColor: 'var(--border)' }}>
                          <div>
                            <p className="text-sm font-semibold text-white">{previewDay.name}</p>
                            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                              Exercises in this session: {previewDay.exercises.length}
                            </p>
                          </div>
                          <div className="coach-preview-sequence">
                            Day {selectedPreviewDay + 1}
                          </div>
                        </div>

                        <div className="px-4 py-3">
                          <div className="coach-preview-columns grid grid-cols-[minmax(0,1.4fr)_6rem_7rem] gap-3 px-1 pb-2">
                            <p className="stat-meta">Exercise</p>
                            <p className="stat-meta text-right">Sets × reps</p>
                            <p className="stat-meta text-right">Start</p>
                          </div>

                          <div>
                            {previewDay.exercises.map((exercise) => (
                              <div
                                key={`${previewDay.name}:${exercise.exerciseSource}:${exercise.exerciseId}`}
                                className="coach-preview-exercise grid grid-cols-[minmax(0,1.4fr)_6rem_7rem] gap-3 px-1 py-3 text-sm"
                              >
                                <div className="min-w-0">
                                  <p className="min-w-0 break-words font-semibold text-white">{exercise.name}</p>
                                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                                    {exercise.exerciseSource === 'user' ? 'My exercise' : 'Shared library'}
                                  </p>
                                </div>
                                <p className="text-right font-semibold text-white">{exercise.sets} x {exercise.targetReps}</p>
                                <p className="text-right" style={{ color: 'var(--muted)' }}>
                                  {exercise.targetWeight > 0 ? `${exercise.targetWeight} kg` : 'Auto'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleEditGeneratedPlan}
                      >
                        Edit before saving
                      </Button>

                      <Button
                        type="button"
                        onClick={() => void handleSaveGeneratedPlan()}
                        disabled={!user || savingPlan}
                        className="inline-flex items-center gap-2"
                      >
                        {savingPlan ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
                        {savingPlan ? 'Saving...' : 'Save as template'}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setPlanPreview(null)
                          setPlanUnavailableSources([])
                        }}
                      >
                        Close preview
                      </Button>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          <div className="ai-side-rail coach-rail">
            {configured && (
              <AiKeyPanel
                onConfiguredChange={handleRailConfiguredChange}
                collapsed={!showConfigPanel}
                onExpand={() => setShowConfigPanel(true)}
                onCollapse={() => setShowConfigPanel(false)}
              />
            )}

            {activeTab === 'plan' && planPreview && (
              <section className="coach-context-panel">
                <div className="coach-context-head">
                  <Sparkles size={16} />
                  <p>Plan context</p>
                </div>
                <div className="coach-context-list">
                  {[
                    { label: 'Goal', value: planGoal.trim() || 'not entered yet' },
                    { label: 'Schedule', value: `${planPreview?.days.length ?? planDays} days per week` },
                    { label: 'Equipment', value: `${planEquipment.length} selected` },
                  ].map((item) => (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
