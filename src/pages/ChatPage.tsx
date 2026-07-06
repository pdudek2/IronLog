import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Bot, LoaderCircle, MessagesSquare, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react'
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
  const [configured, setConfigured] = useState(() => isDemoUser || hasClaudeApiKey())
  const [showConfigPanel, setShowConfigPanel] = useState(() => !isDemoUser && !hasClaudeApiKey())
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

  useEffect(() => {
    if (!isDemoUser || demoSeededRef.current) return
    demoSeededRef.current = true
    setMessages(DEMO_CHAT_MESSAGES)
    setConfigured(true)
    setShowConfigPanel(false)
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
      <section className="hero-editorial">
        <motion.div
          className="flex flex-col gap-5"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <p className="hero-editorial-date">AI Coach · Claude 4</p>
            <div
              className="rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold"
              style={{
                background: configured ? 'var(--accent-soft)' : 'transparent',
                borderColor: configured ? 'var(--accent-soft-strong)' : 'var(--border)',
                border: `1px solid ${configured ? 'var(--accent-soft-strong)' : 'var(--border)'}`,
                color: configured ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {configured ? '● Klucz gotowy' : 'Skonfiguruj klucz'}
            </div>
          </div>

          <div>
            <h1 className="hero-editorial-name">Asystent<br />treningowy.</h1>
          </div>

          <p className="hero-editorial-sub">
            Sprawdź progres, dopytaj o kolejny krok albo ułóż nowy szablon na bazie swojej historii.
          </p>
        </motion.div>
      </section>

      <div className="ai-workspace space-y-5">

        <section className="ai-mode-switch surface-panel rounded-[var(--radius-xl)] p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                key: 'chat' as const,
                eyebrow: 'Rozmowa',
                title: 'Analiza i pytania',
                desc: 'Pytania o progres, ostatnie sesje i kolejne decyzje treningowe.',
              },
              {
                key: 'plan' as const,
                eyebrow: 'Generator',
                title: 'Nowy szablon z AI',
                desc: 'Brief, podgląd i zapis gotowego szablonu.',
              },
            ].map((tab) => {
              const active = activeTab === tab.key

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className="rounded-[var(--radius-lg)] border px-4 py-4 text-left transition"
                  style={{
                    background: active ? 'var(--accent-soft)' : 'rgba(255,255,255,0.02)',
                    borderColor: active ? 'var(--accent-soft-strong)' : 'transparent',
                    boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.04)' : 'none',
                  }}
                >
                  <p className="eyebrow mb-2" style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}>
                    {tab.eyebrow}
                  </p>
                  <p className="text-base font-semibold text-white">{tab.title}</p>
                  <p className="mt-1 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    {tab.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        <div className="ai-workspace-grid grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
          <div className="space-y-5">
            {activeTab === 'chat' ? (
              <>
                <section className="ai-chat-panel surface-panel rounded-[var(--radius-xl)] p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow mb-1">Rozmowa</p>
                      <h2 className="section-title">Chat z kontekstem IronLog</h2>
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
                      className="inline-flex items-center gap-2"
                    >
                      <RotateCcw size={14} />
                      Reset
                    </Button>
                  </div>

                  <div
                    className="overflow-hidden rounded-[var(--radius-lg)] border p-4"
                    style={{
                      background: 'rgba(255,255,255,0.025)',
                      borderColor: 'var(--border)',
                      height: 'min(36rem, calc(100dvh - 22rem))',
                      minHeight: '20rem',
                    }}
                    aria-label="Rozmowa z AI Coachem"
                    aria-busy={sending}
                  >
                    {messages.length === 0 && !streamText ? (
                      <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-8 py-6">
                        <div className="text-center">
                          <div
                            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)]"
                            style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-strong)', color: 'var(--accent)' }}
                          >
                            <Bot size={24} />
                          </div>
                          <p className="text-lg font-semibold text-white">Zacznij od konkretu</p>
                          <p className="mt-2 max-w-sm text-sm leading-6" style={{ color: 'var(--muted)' }}>
                            Asystent widzi Twój profil, gotowość, ostatnie sesje i rekordy.
                          </p>
                        </div>

                        <div className="grid w-full gap-2">
                          {STARTER_PROMPTS.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => void handleSend(prompt)}
                              disabled={!configured || sending}
                              className="rounded-[var(--radius-lg)] border px-4 py-3 text-left text-sm transition hover:border-[rgba(240,67,90,0.3)] hover:bg-[rgba(240,67,90,0.05)] disabled:opacity-50"
                              style={{
                                background: 'rgba(255,255,255,0.025)',
                                borderColor: 'var(--border)',
                                color: 'white',
                              }}
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div
                        ref={chatContainerRef}
                        onScroll={handleChatScroll}
                        className="h-full overflow-y-auto pr-1 no-scrollbar"
                        role="log"
                        aria-live={sending ? 'off' : 'polite'}
                        aria-relevant="additions"
                      >
                        <div className="space-y-4">
                          {messages.map((message) => (
                            <div
                              key={message.id}
                              className="max-w-[90%] rounded-[var(--radius-lg)] border px-4 py-3"
                              style={{
                                marginLeft: message.role === 'assistant' ? 0 : 'auto',
                                background: message.role === 'assistant' ? 'rgba(255,255,255,0.03)' : 'var(--accent-soft)',
                                borderColor: message.role === 'assistant' ? 'var(--border)' : 'var(--accent-soft-strong)',
                              }}
                            >
                              <p className="mb-1 text-[11px] font-semibold" style={{ color: message.role === 'assistant' ? 'var(--muted)' : 'var(--accent)' }}>
                                {message.role === 'assistant' ? 'AI Coach' : 'Ty'}
                              </p>
                              <ChatMarkdown content={message.content} />
                            </div>
                          ))}

                          {sending && !streamText && (
                            <div
                              className="max-w-[90%] rounded-[var(--radius-lg)] border px-4 py-3"
                              style={{
                                background: 'rgba(255,255,255,0.03)',
                                borderColor: 'var(--border)',
                              }}
                            >
                              <p className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                                AI Coach
                              </p>
                              <div className="flex items-center gap-3">
                                <div className="chat-typing-indicator" aria-hidden="true">
                                  <span className="chat-typing-dot" />
                                  <span className="chat-typing-dot" />
                                  <span className="chat-typing-dot" />
                                </div>
                                <p className="text-sm leading-6" style={{ color: 'var(--muted)' }}>
                                  Analizuję historię i składam odpowiedź...
                                </p>
                              </div>
                            </div>
                          )}

                          {streamText && (
                            <div
                              className="max-w-[90%] rounded-[var(--radius-lg)] border px-4 py-3"
                              style={{
                                background: 'rgba(255,255,255,0.03)',
                                borderColor: 'var(--border)',
                              }}
                            >
                              <p className="mb-1 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                                AI Coach
                              </p>
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

                  <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                    <textarea
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
                      className="w-full resize-none rounded-[var(--radius-lg)] px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-[color:var(--muted-soft)] disabled:opacity-60"
                      style={{
                        background: 'var(--input-bg)',
                        border: '1px solid var(--border)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                        overflowY: 'auto',
                      }}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs leading-5" style={{ color: 'var(--muted)' }}>
                        Koszt odpowiedzi rozlicza Twój klucz Claude.
                      </p>

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

                <section className="ai-usage-strip surface-panel rounded-[var(--radius-xl)] p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                    <p className="text-sm font-semibold text-white">Najczęstsze zastosowania</p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {[
                      {
                        icon: <MessagesSquare size={16} />,
                        title: 'Ocena sesji',
                        desc: 'Ocena ostatniego treningu, wolumenu i jakości pracy.',
                      },
                      {
                        icon: <Sparkles size={16} />,
                        title: 'Decyzja na dziś',
                        desc: 'Dobór mocniejszej, lżejszej albo technicznej sesji na dziś.',
                      },
                      {
                        icon: <Bot size={16} />,
                        title: 'Kolejny krok',
                        desc: 'Ustalenie priorytetu na kolejny trening i progresji.',
                      },
                    ].map((item) => (
                      <div
                        key={item.title}
                        className="rounded-[var(--radius-lg)] border p-4"
                        style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span style={{ color: 'var(--accent)' }}>{item.icon}</span>
                          <p className="text-sm font-semibold text-white">{item.title}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <>
                <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow mb-1">Generator planu</p>
                      <h2 className="section-title">Wygeneruj szablon z AI</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                        Podaj cel i ograniczenia, a IronLog przygotuje plan gotowy do zapisania.
                      </p>
                    </div>

                    <div
                      className="rounded-[var(--radius-pill)] border px-3 py-2 text-xs font-semibold"
                      style={{
                        background: planPreview ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                        borderColor: planPreview ? 'var(--accent-soft-strong)' : 'var(--border)',
                        color: planPreview ? 'var(--accent)' : 'var(--muted)',
                      }}
                    >
                      {planPreview ? 'Podgląd gotowy' : 'Brief'}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <span className="stat-meta">Cel planu</span>
                      <input
                        type="text"
                        value={planGoal}
                        onChange={(event) => setPlanGoal(event.target.value)}
                        placeholder="Np. upper/lower pod siłę i prostą progresję"
                        className="mt-2 w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm text-white outline-none"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                      />
                    </label>

                    <div>
                      <span className="stat-meta">Dni w tygodniu</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[2, 3, 4, 5, 6].map((days) => (
                          <button
                            key={days}
                            type="button"
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

                    <div>
                      <span className="stat-meta">Poziom</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {EXPERIENCE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
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

                    <div className="md:col-span-2">
                      <span className="stat-meta">Dostępny sprzęt</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {EQUIPMENT_OPTIONS.map((option) => {
                          const active = planEquipment.includes(option.value)
                          return (
                            <button
                              key={option.value}
                              type="button"
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

                    <label className="block">
                      <span className="stat-meta">Fokus</span>
                      <input
                        type="text"
                        value={planFocus}
                        onChange={(event) => setPlanFocus(event.target.value)}
                        placeholder="Np. mocny bench, lepsze plecy, prosty rytm tygodnia"
                        className="mt-2 w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm text-white outline-none"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                      />
                    </label>

                    <label className="block">
                      <span className="stat-meta">Dodatkowe uwagi</span>
                      <textarea
                        value={planNotes}
                        onChange={(event) => setPlanNotes(event.target.value)}
                        rows={4}
                        placeholder="Np. trening do 60 minut, bez martwego ciągu, nacisk na technikę"
                        className="mt-2 w-full resize-none rounded-[var(--radius-lg)] px-4 py-3 text-sm text-white outline-none"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}
                      />
                    </label>
                  </div>

                  {planError && <div className="mt-4"><SectionError message={planError} /></div>}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs leading-5" style={{ color: 'var(--muted)' }}>
                      Generator bierze pod uwagę profil, historię i katalog ćwiczeń.
                    </p>

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
                  <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="eyebrow mb-1">Podgląd planu</p>
                        <h2 className="section-title">{planPreview.name}</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                          {planPreview.summary}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
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
                            className="min-w-[5.5rem] rounded-[var(--radius-lg)] border px-3 py-3"
                            style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
                          >
                            <p className="stat-meta">{metric.label}</p>
                            <p className="mt-2 text-xl font-semibold text-white">{metric.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
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
                        className="mt-4 rounded-[var(--radius-lg)] border"
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

          <div className="ai-side-rail space-y-5">
            {!isDemoUser && (
              <AiKeyPanel
                onConfiguredChange={setConfigured}
                collapsed={configured && !showConfigPanel}
                onExpand={() => setShowConfigPanel(true)}
                onCollapse={() => setShowConfigPanel(false)}
              />
            )}

            {activeTab === 'chat' ? (
              showConfigPanel || !configured ? (
                <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                    <p className="text-sm font-semibold text-white">Prywatność i dostęp</p>
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                    <p>Klucz działa tylko na tym urządzeniu i nie jest przypisany do konta.</p>
                    <p>Na innym urządzeniu dodasz go osobno.</p>
                    <p>Asystent korzysta z Twojego profilu i historii treningowej, żeby odpowiadać trafniej.</p>
                  </div>
                </section>
              ) : (
                <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)]"
                      style={{
                        background: 'rgba(143,184,160,0.08)',
                        border: '1px solid rgba(143,184,160,0.16)',
                        color: 'var(--success)',
                      }}
                    >
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Prywatność i dostęp</p>
                      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                        Klucz działa lokalnie, a odpowiedzi korzystają z kontekstu Twoich treningów.
                      </p>
                    </div>
                  </div>
                </section>
              )
            ) : (
              <>
                <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                  <p className="eyebrow mb-1">Jak pisać brief</p>
                  <h2 className="section-title mb-4">Co pomaga generatorowi</h2>
                  <div className="space-y-3">
                    {[
                      'Podaj konkretny cel: siła, masa, powrót po przerwie albo prosty rytm 3-4 dni.',
                      'Dopisz ograniczenia: czas treningu, brak wybranych ćwiczeń, nacisk na technikę.',
                      'Wskaż fokus, jeśli chcesz mocniej popchnąć bench, plecy albo nogi.',
                    ].map((tip) => (
                      <div
                        key={tip}
                        className="rounded-[var(--radius-lg)] border px-4 py-3 text-sm leading-6"
                        style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)', color: 'var(--muted)' }}
                      >
                        {tip}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                  <p className="eyebrow mb-1">Status planu</p>
                  <h2 className="section-title mb-4">Podsumowanie</h2>
                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
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
                        className="rounded-[var(--radius-lg)] border px-4 py-4"
                        style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
                      >
                        <p className="stat-meta">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
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
