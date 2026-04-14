import { useEffect, useRef, useState } from 'react'
import { Bot, LoaderCircle, MessagesSquare, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import AppShell from '../components/AppShell'
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
        background: 'rgba(255,87,87,0.08)',
        borderColor: 'rgba(255,87,87,0.18)',
        color: '#ff9c9c',
      }}
    >
      {message}
    </div>
  )
}

export default function ChatPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<AiWorkspaceTab>('chat')
  const [configured, setConfigured] = useState(() => hasClaudeApiKey())
  const [messages, setMessages] = useState<ChatMessage[]>([])
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

  const previewDay = planPreview?.days[selectedPreviewDay] ?? null
  const totalPlanExercises = planPreview?.days.reduce((sum, day) => sum + day.exercises.length, 0) ?? 0

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, streamText])

  useEffect(() => {
    setSelectedPreviewDay(0)
  }, [planPreview])

  async function handleSend(rawPrompt?: string) {
    const prompt = (rawPrompt ?? input).trim()
    if (!prompt || sending) return

    const apiKey = getClaudeApiKey()
    if (!apiKey) {
      setConfigured(false)
      setError('Dodaj Claude API key, żeby uruchomić AI Coach.')
      return
    }

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
    <AppShell current="chat">
      <div className="space-y-5">
        <motion.section
          className="surface-panel rounded-[var(--radius-xl)] p-5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-2" style={{ color: 'var(--accent)' }}>
                AI Coach
              </p>
              <h1 className="page-title">Asystent treningowy</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
                Rozmawiaj o progresie albo wygeneruj gotowy szablon treningowy na bazie swojego celu,
                sprzętu i historii pracy w IronLog.
              </p>
            </div>

            <div
              className="rounded-[var(--radius-lg)] border px-4 py-3 text-sm font-semibold"
              style={{
                background: configured ? 'var(--accent-soft)' : 'transparent',
                borderColor: configured ? 'var(--accent-soft-strong)' : 'var(--border)',
                color: configured ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {configured ? 'BYOK gotowy' : 'Skonfiguruj klucz'}
            </div>
          </div>
        </motion.section>

        <section className="surface-panel rounded-[var(--radius-xl)] p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                key: 'chat' as const,
                eyebrow: 'Rozmowa',
                title: 'Analiza i pytania',
                desc: 'Rozmowa o progresie, ostatnich sesjach i decyzjach treningowych.',
              },
              {
                key: 'plan' as const,
                eyebrow: 'Generator',
                title: 'Nowy szablon z AI',
                desc: 'Brief, podgląd planu i zapis gotowej rozpiski do szablonów.',
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

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.5fr)]">
          <div className="space-y-5">
            {activeTab === 'chat' ? (
              <>
                <section className="surface-panel rounded-[var(--radius-xl)] p-5">
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
                    aria-live="polite"
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
                          <p className="text-lg font-semibold text-white">Gotowy na pierwszą rozmowę</p>
                          <p className="mt-2 max-w-sm text-sm leading-6" style={{ color: 'var(--muted)' }}>
                            AI Coach bierze pod uwagę profil, readiness, ostatnie treningi i top rekordy.
                          </p>
                        </div>

                        <div className="grid w-full gap-2">
                          {STARTER_PROMPTS.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => void handleSend(prompt)}
                              disabled={!configured || sending}
                              className="rounded-[var(--radius-lg)] border px-4 py-3 text-left text-sm transition hover:border-[rgba(90,166,255,0.3)] hover:bg-[rgba(90,166,255,0.05)] disabled:opacity-50"
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
                      <div ref={chatContainerRef} className="h-full overflow-y-auto pr-1 no-scrollbar">
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
                              <p className="mb-1 text-[11px] font-semibold tracking-[0.04em]" style={{ color: message.role === 'assistant' ? 'var(--muted)' : 'var(--accent)' }}>
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
                              <p className="mb-1 text-[11px] font-semibold tracking-[0.04em]" style={{ color: 'var(--muted)' }}>
                                AI Coach
                              </p>
                              <div className="flex items-center gap-3">
                                <div className="chat-typing-indicator" aria-hidden="true">
                                  <span className="chat-typing-dot" />
                                  <span className="chat-typing-dot" />
                                  <span className="chat-typing-dot" />
                                </div>
                                <p className="text-sm leading-6" style={{ color: 'var(--muted)' }}>
                                  Analizuję Twoje dane i układam odpowiedź...
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
                              <p className="mb-1 text-[11px] font-semibold tracking-[0.04em]" style={{ color: 'var(--muted)' }}>
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
                      placeholder={configured ? 'Napisz wiadomość...' : 'Dodaj najpierw Claude API key, aby odblokować czat'}
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
                        Koszt odpowiedzi rozlicza Twój własny klucz Claude.
                      </p>

                      <Button
                        type="submit"
                        disabled={!configured || !input.trim() || sending}
                        className="inline-flex items-center gap-2"
                        onPointerDown={(e) => { e.preventDefault(); void handleSend() }}
                      >
                        {sending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
                        {sending ? 'Wysyłanie...' : 'Wyślij'}
                      </Button>
                    </div>
                  </form>
                </section>

                <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                    <p className="text-sm font-semibold text-white">Najlepsze zastosowania</p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {[
                      {
                        icon: <MessagesSquare size={16} />,
                        title: 'Ocena sesji',
                        desc: 'Analiza ostatniego treningu, wolumenu i jakości pracy.',
                      },
                      {
                        icon: <Sparkles size={16} />,
                        title: 'Decyzja na dziś',
                        desc: 'Mocniejsza, lżejsza albo techniczna sesja na podstawie readiness.',
                      },
                      {
                        icon: <Bot size={16} />,
                        title: 'Kolejny krok',
                        desc: 'Rozmowa o priorytecie następnego treningu i progresie.',
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
                        Opisz cel i ograniczenia, a IronLog przygotuje gotowy plan do zapisania jako szablon.
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
                      {planPreview ? 'Podgląd gotowy' : 'Brief planu'}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <span className="stat-meta">Cel planu</span>
                      <input
                        type="text"
                        value={planGoal}
                        onChange={(event) => setPlanGoal(event.target.value)}
                        placeholder="Np. upper/lower pod budowę siły i prostą progresję"
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
                        placeholder="Np. mocny bench, poprawa pleców, prosty rytm treningowy"
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
                      Generator korzysta z Twojego profilu, historii i dostępnych ćwiczeń w katalogu IronLog.
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
                            <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">{metric.value}</p>
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

          <div className="space-y-5">
            <AiKeyPanel onConfiguredChange={setConfigured} />

            {activeTab === 'chat' ? (
              <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                  <p className="text-sm font-semibold text-white">Prywatność i dostęp</p>
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                  <p>Klucz Claude zostaje tylko na tym urządzeniu i nie zapisuje się przy koncie.</p>
                  <p>Na innym urządzeniu albo po wyczyszczeniu danych trzeba dodać go ponownie.</p>
                  <p>Asystent korzysta z Twojego profilu i historii treningowej, żeby odpowiadać trafniej.</p>
                </div>
              </section>
            ) : (
              <>
                <section className="surface-panel rounded-[var(--radius-xl)] p-5">
                  <p className="eyebrow mb-1">Jak pisać brief</p>
                  <h2 className="section-title mb-4">Co poprawia jakość planu</h2>
                  <div className="space-y-3">
                    {[
                      'Podaj realny cel: siła, masa, powrót po przerwie albo prosty rytm 3-4 dni.',
                      'Dopisz ograniczenia: czas treningu, brak niektórych ćwiczeń, nacisk na technikę.',
                      'Użyj fokusu, jeśli chcesz podbić konkretny obszar, np. bench albo plecy.',
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
                  <h2 className="section-title mb-4">Na czym stoimy</h2>
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
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
