import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Bot, LoaderCircle, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import AiKeyPanel from '../components/AiKeyPanel'
import ChatMarkdown from '../components/ChatMarkdown'
import { Button } from '../components/ui'
import { getClaudeApiKey, hasClaudeApiKey } from '../lib/aiKeyStorage'
import { createTemplate } from '../lib/templateService'
import { saveTemplateDraft } from '../lib/templateDraftStorage'
import {
  generateTrainingPlan,
  streamChatReply,
  type ChatMessage,
  type GeneratedTrainingPlan,
} from '../lib/chatService'
import { useAuthStore } from '../store/authStore'

const STARTER_PROMPTS = [
  'Przeanalizuj mój ostatni tydzień treningowy.',
  'Na czym powinienem się skupić w kolejnym treningu upper body?',
  'Czy moje readiness sugeruje dziś mocniejszą czy lżejszą sesję?',
]

const STARTER_PROMPT_LABELS: Record<string, string> = {
  'Przeanalizuj mój ostatni tydzień treningowy.': 'Podsumuj tydzień',
  'Na czym powinienem się skupić w kolejnym treningu upper body?': 'Kolejny upper',
  'Czy moje readiness sugeruje dziś mocniejszą czy lżejszą sesję?': 'Readiness dziś',
}

const DEMO_EMAIL = 'demo@ironlog.app'

const DEMO_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'demo-msg-1',
    role: 'user',
    content: 'Przeanalizuj mój ostatni tydzień treningowy.',
  },
  {
    id: 'demo-msg-2',
    role: 'assistant',
    content: `Zrobiłeś **3 pełne sesje** w tym tygodniu (Upper A, Lower A, Upper B) — solidny mikrocykl.

**Kluczowe momenty:**
- **Bench Press**: 72.5 kg × 8, 8, 7, 6 — nowy PR w serii roboczej
- **Squat**: 100 kg × 6, 6, 5, 5 — pierwszy raz trzycyfrowy ciężar
- **OHP**: 50 kg × 6, 5, 5 — trzymasz tempo

**Readiness** z ostatnich 7 dni: średnio 4/5 snu, soreness 2/5. Masz zielone światło na progresję.

**Na jutro (Lower B):**
- Deadlift **122.5 kg** w top secie (ostrożnie, sprawdź technikę)
- Bulgarian Split Squat bez zmian
- Trzymaj wolumen na core — ostatnio spadł.`,
  },
  {
    id: 'demo-msg-3',
    role: 'user',
    content: 'Co z plateau w OHP? Tkwię na 50 kg od dwóch tygodni.',
  },
  {
    id: 'demo-msg-4',
    role: 'assistant',
    content: `Klasyczny stall przy OHP — typowe okno między 45-55 kg. Kilka powodów może za tym stać:

1. **Za mała praca pomocnicza** tylnych aktonów barków i tricepsa
2. **Słaby lockout** — potrzeba więcej objętości nad głową
3. **Recovery** — OHP mocno reaguje na deficyt snu

**Plan na 3 tygodnie:**
- **Tydzień 1 (deload)**: OHP 42.5 kg 3×8, pełne kontrolowane powtórzenia
- **Tydzień 2 (intensity)**: OHP 47.5 kg 5×3 + **Face Pull 4×15** po każdym Upper
- **Tydzień 3 (PR attempt)**: 3 serie rozgrzewkowe → 52.5 kg × 3-5

Dodatkowo: **Seated DB Press 3×10** zaraz po OHP. Uzupełni wolumen bez dodatkowego obciążenia stawów.

Wróć po tygodniu z feedbackiem jak idzie.`,
  },
]

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Początkujący' },
  { value: 'intermediate', label: 'Średniozaawansowany' },
  { value: 'advanced', label: 'Zaawansowany' },
]

const EQUIPMENT_OPTIONS = [
  { value: 'barbell', label: 'Sztanga' },
  { value: 'dumbbell', label: 'Hantle' },
  { value: 'cable', label: 'Wyciąg' },
  { value: 'machine', label: 'Maszyny' },
  { value: 'bodyweight', label: 'Własne ciało' },
  { value: 'kettlebell', label: 'Kettlebell' },
]

type AiWorkspaceTab = 'chat' | 'plan'

function SectionError({ message }: { message: string }) {
  return (
    <div
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

export default function ChatPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isDemoUser = user?.email === DEMO_EMAIL
  const [activeTab, setActiveTab] = useState<AiWorkspaceTab>('chat')
  const [configured, setConfigured] = useState(() => hasClaudeApiKey())
  const [showConfigPanel, setShowConfigPanel] = useState(() => !hasClaudeApiKey())
  const [messages, setMessages] = useState<ChatMessage[]>(() => (isDemoUser ? DEMO_CHAT_MESSAGES : []))
  const demoSeededRef = useRef(isDemoUser)
  const [input, setInput] = useState('')
  const [streamText, setStreamText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const [planGoal, setPlanGoal] = useState('')
  const [planDays, setPlanDays] = useState(3)
  const [planExperience, setPlanExperience] = useState('intermediate')
  const [planFocus, setPlanFocus] = useState('')
  const [planNotes, setPlanNotes] = useState('')
  const [planEquipment, setPlanEquipment] = useState<string[]>(['barbell', 'dumbbell', 'bodyweight'])
  const [planPreview, setPlanPreview] = useState<GeneratedTrainingPlan | null>(null)
  const [planError, setPlanError] = useState('')
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [selectedPreviewDay, setSelectedPreviewDay] = useState(0)
  const chatContainerRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)

  const previewDay = planPreview?.days[selectedPreviewDay] ?? null
  const totalPlanExercises = planPreview?.days.reduce((sum, day) => sum + day.exercises.length, 0) ?? 0
  const assistantReplies = messages.filter((message) => message.role === 'assistant').length
  const promptCount = messages.filter((message) => message.role === 'user').length

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

  useEffect(() => {
    setSelectedPreviewDay(0)
  }, [planPreview])

  useEffect(() => {
    if (!configured) {
      setShowConfigPanel(true)
    }
  }, [configured])

  async function handleSend(rawPrompt?: string) {
    const prompt = (rawPrompt ?? input).trim()
    if (!prompt || sending) return

    const apiKey = getClaudeApiKey()
    if (!apiKey) {
      setConfigured(false)
      setError('Dodaj Claude API key, żeby uruchomić AI Coach.')
      return
    }

    shouldStickToBottomRef.current = true
    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: prompt,
      },
    ]

    setMessages(nextMessages)
    setInput('')
    setError('')
    setSending(true)
    setStreamText('')

    try {
      const reply = await streamChatReply({
        apiKey,
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        onChunk: (chunk) => {
          setStreamText((current) => current + chunk)
        },
      })

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply || 'Nie udało się wygenerować odpowiedzi.',
        },
      ])
      setStreamText('')
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Nie udało się połączyć z AI Coachem.'
      setError(message)
      setStreamText('')
    } finally {
      setSending(false)
    }
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
    const apiKey = getClaudeApiKey()
    if (!apiKey) {
      setConfigured(false)
      setPlanError('Dodaj Claude API key, żeby odblokować generator planu.')
      return
    }

    if (planGoal.trim().length < 2) {
      setPlanError('Podaj cel planu, zanim uruchomisz generator.')
      return
    }

    setPlanError('')
    setGeneratingPlan(true)

    try {
      const plan = await generateTrainingPlan({
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

      setPlanPreview(plan)
      setActiveTab('plan')
      toast.success('Plan wygenerowany. Możesz go zapisać jako szablon.')
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Nie udało się wygenerować planu.'
      setPlanError(message)
      setPlanPreview(null)
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
      toast.success('Plan zapisany jako nowy szablon.')
      setPlanPreview(null)
      setPlanGoal('')
      setPlanFocus('')
      setPlanNotes('')
      setPlanError('')
    } catch {
      setPlanError('Nie udało się zapisać wygenerowanego planu.')
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

  return (
    <>
      <section className="coach-header">
        <motion.div
          className="coach-header-copy"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <p className="coach-kicker">AI Coach</p>
          <h1>Coach.</h1>
          <p>Rozmowa, decyzje treningowe i generator planu w jednym miejscu.</p>
        </motion.div>

        <div className="coach-header-panel" aria-label="Status AI Coacha">
          <div className="coach-status-line">
            <span data-ready={configured} />
            <strong>{configured ? 'Klucz gotowy' : 'Klucz wymagany'}</strong>
          </div>
          <div className="coach-header-stats">
            <span>
              <strong>{promptCount}</strong>
              pyt.
            </span>
            <span>
              <strong>{assistantReplies}</strong>
              odp.
            </span>
            <span>
              <strong>{activeTab === 'chat' ? 'Chat' : 'Plan'}</strong>
              tryb
            </span>
          </div>
        </div>
      </section>

      <div className="ai-workspace coach-workspace">
        <section className="coach-mode-switch" aria-label="Tryb AI Coacha">
            {[
              {
                key: 'chat' as const,
                title: 'Rozmowa',
                desc: 'Pytania, analiza, decyzja na dziś.',
              },
              {
                key: 'plan' as const,
                title: 'Plan',
                desc: 'Brief, podgląd, zapis szablonu.',
              },
            ].map((tab) => {
              const active = activeTab === tab.key

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className="coach-mode-button"
                  data-active={active}
                >
                  <strong>{tab.title}</strong>
                  <span>{tab.desc}</span>
                </button>
              )
            })}
        </section>

        <div className="coach-workspace-grid">
          <div className="coach-main-flow">
            {activeTab === 'chat' ? (
              <>
                <section className="coach-chat-panel surface-panel">
                  <div className="coach-panel-head">
                    <div>
                      <p>Rozmowa</p>
                      <h2>Decyzje treningowe</h2>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setMessages([])
                        setStreamText('')
                        setError('')
                      }}
                      disabled={messages.length === 0 && !streamText}
                      className="coach-reset-button inline-flex items-center gap-2"
                    >
                      <RotateCcw size={14} />
                      Reset
                    </Button>
                  </div>

                  <div
                    className={`coach-thread ${messages.length === 0 && !streamText ? 'coach-thread--empty' : ''}`}
                    aria-label="Rozmowa z AI Coachem"
                    aria-busy={sending}
                  >
                    {messages.length === 0 && !streamText ? (
                      <div className="coach-empty-thread">
                        <div>
                          <div className="coach-empty-icon">
                            <Bot size={24} />
                          </div>
                          <p>Zacznij od pytania</p>
                          <span>Tydzień, kolejny trening, readiness albo plateau.</span>
                        </div>

                        <div className="coach-empty-prompts">
                          {STARTER_PROMPTS.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => void handleSend(prompt)}
                              disabled={!configured || sending}
                              className="coach-prompt-button"
                              aria-label={prompt}
                            >
                              <span className="coach-prompt-full">{prompt}</span>
                              <span className="coach-prompt-short">{STARTER_PROMPT_LABELS[prompt] ?? prompt}</span>
                            </button>
                          ))}
                        </div>
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
                                {message.role === 'assistant' ? 'AI Coach' : 'Ty'}
                              </p>
                              <ChatMarkdown content={message.content} />
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
                                <span className="coach-thinking">Analizuję kontekst...</span>
                              </div>
                            </div>
                          )}

                          {streamText && (
                            <div className="coach-message" data-role="assistant">
                              <p>AI Coach</p>
                              <div className="flex items-end gap-1">
                                <div className="min-w-0 flex-1">
                                  <ChatMarkdown content={streamText} />
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

                  {error && <SectionError message={error} />}

                  <form onSubmit={handleSubmit} className="coach-composer">
                    <textarea
                      aria-label="Wiadomość do AI Coacha"
                      value={input}
                      onChange={(event) => {
                        setInput(event.target.value)
                        const el = event.target
                        el.style.height = 'auto'
                        el.style.height = `${Math.min(el.scrollHeight, 160)}px`
                      }}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={configured ? 'Zapytaj o progres, plan albo ostatnią sesję' : 'Dodaj Claude API key, żeby odblokować czat'}
                      disabled={!configured || sending}
                      rows={2}
                      className="coach-composer-input"
                    />

                    <div className="coach-composer-footer">
                      <p>Koszt odpowiedzi rozlicza Twój klucz Claude.</p>

                      <Button
                        type="submit"
                        disabled={!configured || !input.trim() || sending}
                        className="inline-flex items-center gap-2"
                      >
                        {sending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
                        {sending ? 'Wysyłanie...' : 'Wyślij'}
                      </Button>
                    </div>
                  </form>
                </section>
              </>
            ) : (
              <>
                <section className="coach-plan-panel surface-panel">
                  <div className="coach-panel-head">
                    <div>
                      <p>Generator planu</p>
                      <h2>Brief treningowy</h2>
                    </div>

                    <div
                      className="coach-plan-state"
                      style={{
                        background: planPreview ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                        borderColor: planPreview ? 'var(--accent-soft-strong)' : 'var(--border)',
                        color: planPreview ? 'var(--accent)' : 'var(--muted)',
                      }}
                    >
                      {planPreview ? 'Podgląd gotowy' : 'Brief'}
                    </div>
                  </div>

                  <div className="coach-plan-form">
                    <label className="coach-field md:col-span-2">
                      <span className="stat-meta">Cel planu</span>
                      <input
                        type="text"
                        value={planGoal}
                        onChange={(event) => setPlanGoal(event.target.value)}
                        placeholder="Np. upper/lower pod siłę i prostą progresję"
                      />
                    </label>

                    <div className="coach-field">
                      <span className="stat-meta">Dni w tygodniu</span>
                      <div className="coach-chip-row" role="group" aria-label="Liczba dni treningowych w tygodniu">
                        {[2, 3, 4, 5, 6].map((days) => (
                          <button
                            key={days}
                            type="button"
                            aria-pressed={planDays === days}
                            onClick={() => setPlanDays(days)}
                            className="rounded-[var(--radius-pill)] border px-3 py-2 text-sm font-semibold transition"
                            style={{
                              background: planDays === days ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                              borderColor: planDays === days ? 'var(--accent-soft-strong)' : 'var(--border)',
                              color: planDays === days ? 'var(--accent)' : 'var(--muted)',
                            }}
                          >
                            {days} dni
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="coach-field">
                      <span className="stat-meta">Poziom</span>
                      <div className="coach-chip-row" role="group" aria-label="Poziom zaawansowania">
                        {EXPERIENCE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={planExperience === option.value}
                            onClick={() => setPlanExperience(option.value)}
                            className="rounded-[var(--radius-pill)] border px-3 py-2 text-sm font-semibold transition"
                            style={{
                              background: planExperience === option.value ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                              borderColor: planExperience === option.value ? 'var(--accent-soft-strong)' : 'var(--border)',
                              color: planExperience === option.value ? 'var(--accent)' : 'var(--muted)',
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="coach-field md:col-span-2">
                      <span className="stat-meta">Dostępny sprzęt</span>
                      <div className="coach-chip-row" role="group" aria-label="Dostępny sprzęt">
                        {EQUIPMENT_OPTIONS.map((option) => {
                          const active = planEquipment.includes(option.value)
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleEquipment(option.value)}
                              className="rounded-[var(--radius-pill)] border px-3 py-2 text-sm font-semibold transition"
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
                      <span className="stat-meta">Fokus</span>
                      <input
                        type="text"
                        value={planFocus}
                        onChange={(event) => setPlanFocus(event.target.value)}
                        placeholder="Np. mocny bench, lepsze plecy, prosty rytm tygodnia"
                      />
                    </label>

                    <label className="coach-field">
                      <span className="stat-meta">Dodatkowe uwagi</span>
                      <textarea
                        value={planNotes}
                        onChange={(event) => setPlanNotes(event.target.value)}
                        rows={4}
                        placeholder="Np. trening do 60 minut, bez martwego ciągu, nacisk na technikę"
                      />
                    </label>
                  </div>

                  {planError && <div className="mt-4"><SectionError message={planError} /></div>}

                  <div className="coach-plan-actions">
                    <p>Profil, historia i katalog ćwiczeń są dołączane do briefu.</p>

                    <Button
                      type="button"
                      onClick={() => void handleGeneratePlan()}
                      disabled={!configured || generatingPlan}
                      className="inline-flex items-center gap-2"
                    >
                      {generatingPlan ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
                      {generatingPlan ? 'Generowanie planu...' : 'Generuj plan'}
                    </Button>
                  </div>
                </section>

                {planPreview && (
                  <section className="coach-plan-preview surface-panel">
                    <div className="coach-plan-preview-head">
                      <div>
                        <p>Podgląd planu</p>
                        <h2>{planPreview.name}</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                          {planPreview.summary}
                        </p>
                      </div>

                      <div className="coach-preview-stats">
                        {[
                          { label: 'Dni', value: String(planPreview.days.length) },
                          { label: 'Ćwiczenia', value: String(totalPlanExercises) },
                          {
                            label: 'Tryb',
                            value: planExperience === 'beginner'
                              ? 'Start'
                              : planExperience === 'advanced'
                                ? 'Pro'
                                : 'Flow',
                          },
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

                    <div className="coach-chip-row mt-5">
                      {planPreview.days.map((day, index) => (
                        <button
                          key={`${day.name}-${index}`}
                          type="button"
                          onClick={() => setSelectedPreviewDay(index)}
                          className="rounded-[var(--radius-pill)] border px-3 py-2 text-sm font-semibold transition"
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
                      <div
                        className="coach-preview-day"
                        style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
                      >
                        <div className="flex items-center justify-between gap-3 border-b px-4 py-4" style={{ borderColor: 'var(--border)' }}>
                          <div>
                            <p className="text-sm font-semibold text-white">{previewDay.name}</p>
                            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                              {previewDay.exercises.length} ćwiczeń w tej jednostce
                            </p>
                          </div>
                          <div
                            className="rounded-[var(--radius-pill)] border px-3 py-1.5 text-xs font-semibold"
                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border)', color: 'var(--muted)' }}
                          >
                            Dzień {selectedPreviewDay + 1}
                          </div>
                        </div>

                        <div className="px-4 py-3">
                          <div className="grid grid-cols-[minmax(0,1.4fr)_6rem_7rem] gap-3 px-1 pb-2">
                            <p className="stat-meta">Ćwiczenie</p>
                            <p className="stat-meta text-right">Serie x powt.</p>
                            <p className="stat-meta text-right">Start</p>
                          </div>

                          <div className="space-y-2">
                            {previewDay.exercises.map((exercise) => (
                              <div
                                key={`${previewDay.name}:${exercise.exerciseSource}:${exercise.exerciseId}`}
                                className="grid grid-cols-[minmax(0,1.4fr)_6rem_7rem] gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-sm"
                                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-white">{exercise.name}</p>
                                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                                    {exercise.exerciseSource === 'user' ? 'Moje ćwiczenie' : 'Katalog globalny'}
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
                        Edytuj przed zapisem
                      </Button>

                      <Button
                        type="button"
                        onClick={() => void handleSaveGeneratedPlan()}
                        disabled={!user || savingPlan}
                        className="inline-flex items-center gap-2"
                      >
                        {savingPlan ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
                        {savingPlan ? 'Zapisywanie...' : 'Zapisz jako szablon'}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setPlanPreview(null)}
                      >
                        Zamknij podgląd
                      </Button>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>

          <div className="ai-side-rail coach-rail">
            <AiKeyPanel
              onConfiguredChange={setConfigured}
              collapsed={configured && !showConfigPanel}
              onExpand={() => setShowConfigPanel(true)}
              onCollapse={() => setShowConfigPanel(false)}
            />

            {activeTab === 'chat' ? (
              showConfigPanel || !configured ? (
                <section className="coach-context-panel surface-panel">
                  <div className="coach-context-head">
                    <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                    <p>Prywatność</p>
                  </div>
                  <div className="coach-context-list">
                    <div>
                      <span>Klucz</span>
                      <strong>lokalnie</strong>
                    </div>
                    <div>
                      <span>Konto</span>
                      <strong>osobno na każdym urządzeniu</strong>
                    </div>
                    <div>
                      <span>Kontekst</span>
                      <strong>historia, gotowość, rekordy</strong>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="coach-context-panel surface-panel">
                  <div className="coach-context-head">
                    <span>
                      <ShieldCheck size={16} />
                    </span>
                    <p>Kontekst</p>
                  </div>
                  <div className="coach-context-list">
                    <div>
                      <span>Źródła</span>
                      <strong>profil, treningi, rekordy</strong>
                    </div>
                    <div>
                      <span>Tryb</span>
                      <strong>rozmowa</strong>
                    </div>
                    <div>
                      <span>Klucz</span>
                      <strong>lokalnie w przeglądarce</strong>
                    </div>
                  </div>
                </section>
              )
            ) : (
              <>
                <section className="coach-context-panel surface-panel">
                  <div className="coach-context-head">
                    <Sparkles size={16} />
                    <p>Brief</p>
                  </div>
                  <div className="coach-context-list">
                    {[
                      ['Cel', 'siła, masa, powrót, rytm'],
                      ['Ograniczenia', 'czas, sprzęt, ćwiczenia'],
                      ['Fokus', 'partia, lift, technika'],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                      >
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="coach-context-panel surface-panel">
                  <div className="coach-context-head">
                    <Bot size={16} />
                    <p>Status planu</p>
                  </div>
                  <div className="coach-context-list">
                    {[
                      {
                        label: 'Tryb',
                        value: planPreview ? 'Podgląd' : 'Brief',
                      },
                      {
                        label: 'Dni',
                        value: String(planPreview?.days.length ?? planDays),
                      },
                      {
                        label: 'Ćwiczenia',
                        value: String(totalPlanExercises || 0),
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                      >
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
