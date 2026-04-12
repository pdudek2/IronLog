import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Card, Input } from './ui'
import {
  clearClaudeApiKey,
  clearClaudeModel,
  getClaudeApiKey,
  getClaudeModel,
  setClaudeApiKey,
  setClaudeModel,
} from '../lib/aiKeyStorage'
import { fetchAvailableClaudeModels, type ClaudeModelOption } from '../lib/chatService'

interface AiKeyPanelProps {
  onConfiguredChange?: (configured: boolean) => void
}

function maskKey(key: string): string {
  if (key.length <= 10) return key
  return `${key.slice(0, 7)}...${key.slice(-4)}`
}

export default function AiKeyPanel({ onConfiguredChange }: AiKeyPanelProps) {
  const [draft, setDraft] = useState(() => getClaudeApiKey())
  const [savedKey, setSavedKey] = useState(() => getClaudeApiKey())
  const [selectedModel, setSelectedModel] = useState(() => getClaudeModel())
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<ClaudeModelOption[]>([])
  const [modelsError, setModelsError] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)

  const hasSavedKey = savedKey.length > 0

  const savedPreview = useMemo(() => (
    hasSavedKey ? maskKey(savedKey) : ''
  ), [hasSavedKey, savedKey])

  useEffect(() => {
    onConfiguredChange?.(hasSavedKey)
  }, [hasSavedKey, onConfiguredChange])

  useEffect(() => {
    if (!savedKey) return

    let cancelled = false

    async function loadModels() {
      setLoadingModels(true)
      setModelsError('')

      try {
        const nextModels = await fetchAvailableClaudeModels(savedKey)
        if (cancelled) return
        setModels(nextModels)

        const currentModel = getClaudeModel()
        const fallbackModel = nextModels[0]?.id ?? ''
        const nextSelected = nextModels.some((model) => model.id === currentModel)
          ? currentModel
          : fallbackModel

        setSelectedModel(nextSelected)
        if (nextSelected) setClaudeModel(nextSelected)
      } catch (nextError) {
        if (cancelled) return
        const message = nextError instanceof Error ? nextError.message : 'Nie udało się pobrać modeli Claude.'
        setModelsError(message)
      } finally {
        if (!cancelled) setLoadingModels(false)
      }
    }

    void loadModels()

    return () => {
      cancelled = true
    }
  }, [savedKey])

  function handleSave() {
    const normalized = draft.trim()

    if (normalized.length < 20) {
      setError('Klucz wygląda na zbyt krótki. Wklej pełny Claude API key.')
      setSaved(false)
      return
    }

    const nextKey = setClaudeApiKey(normalized)
    setSavedKey(nextKey)
    setDraft(nextKey)
    setError('')
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  function handleClear() {
    clearClaudeApiKey()
    clearClaudeModel()
    setSavedKey('')
    setDraft('')
    setSelectedModel('')
    setModels([])
    setModelsError('')
    setShowKey(false)
    setSaved(false)
    setError('')
  }

  return (
    <Card>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow" style={{ color: 'var(--accent)' }}>
            Konfiguracja
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-white">
            Claude API key
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Klucz zapisujesz tylko na tym urządzeniu. W każdej chwili możesz go podmienić albo usunąć.
          </p>
        </div>

        <div
          className="hidden rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold sm:inline-flex"
          style={{
            background: hasSavedKey ? 'var(--success-soft)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${hasSavedKey ? 'rgba(25,213,159,0.18)' : 'var(--border)'}`,
            color: hasSavedKey ? 'var(--success)' : 'var(--muted)',
          }}
        >
          {hasSavedKey ? 'Klucz gotowy' : 'Brak klucza'}
        </div>
      </div>

      <div className="grid gap-3">
        <label className="flex flex-col gap-2">
          <span className="stat-meta">Twój klucz</span>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder="Wklej Claude API key"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setSaved(false)
                if (error) setError('')
              }}
              error={error}
              autoComplete="off"
              spellCheck={false}
              className="w-full"
            />

            <div className="flex gap-2 sm:flex-none">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowKey((current) => !current)}
                aria-label={showKey ? 'Ukryj klucz' : 'Pokaż klucz'}
                className="flex-1 sm:flex-none"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={handleClear}
                disabled={!hasSavedKey && draft.length === 0}
                aria-label="Usuń lokalnie zapisany klucz"
                className="flex-1 sm:flex-none"
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        </label>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
          <div
            className="rounded-[var(--radius-lg)] border p-4"
            style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
              <p className="text-sm font-semibold text-white">Jak to działa</p>
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              <p>Klucz zostaje tylko na tym urządzeniu.</p>
              <p>Po odświeżeniu strony dalej będzie dostępny, ale na innym urządzeniu dodajesz go osobno.</p>
              <p>IronLog używa go wyłącznie do odpowiedzi w tym czacie.</p>
            </div>
          </div>

          <div
            className="rounded-[var(--radius-lg)] border p-4"
            style={{
              background: hasSavedKey ? 'var(--accent-soft)' : 'rgba(255,255,255,0.025)',
              borderColor: hasSavedKey ? 'var(--accent-soft-strong)' : 'var(--border)',
            }}
          >
            <div className="flex items-center gap-2">
              <KeyRound size={16} style={{ color: hasSavedKey ? 'var(--accent)' : 'var(--muted)' }} />
              <p className="text-sm font-semibold text-white">Status lokalny</p>
            </div>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              {hasSavedKey
                ? `Zapisany klucz: ${savedPreview}`
                : 'Jeszcze nie dodano żadnego klucza Claude API na tym urządzeniu.'}
            </p>
            <Button
              type="button"
              onClick={handleSave}
              className="mt-4 w-full"
              style={saved
                ? {
                    background: 'linear-gradient(180deg, var(--success) 0%, #11bc8b 100%)',
                    color: '#081813',
                    boxShadow: '0 14px 32px rgba(25,213,159,0.2)',
                  }
                : undefined}
            >
              {saved ? 'Zapisano klucz' : hasSavedKey ? 'Zaktualizuj klucz' : 'Zapisz klucz'}
            </Button>
          </div>
        </div>

        <div
          className="rounded-[var(--radius-lg)] border p-4"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Model Claude</p>
              <p className="mt-1 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                IronLog użyje wybranego modelu do czatu i generatora planu.
              </p>
            </div>

            {loadingModels && (
              <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Ładowanie...
              </span>
            )}
          </div>

          <div className="mt-4">
            <select
              value={selectedModel}
              disabled={!hasSavedKey || loadingModels || models.length === 0}
              onChange={(event) => {
                const nextModel = setClaudeModel(event.target.value)
                setSelectedModel(nextModel)
              }}
              className="w-full rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none"
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                color: 'white',
              }}
            >
              {models.length === 0 ? (
                <option value="">
                  {hasSavedKey ? 'Brak dostępnych modeli' : 'Dodaj najpierw klucz'}
                </option>
              ) : (
                models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedModel && (
            <p className="mt-3 text-xs leading-5" style={{ color: 'var(--muted)' }}>
              Wybrany model: {selectedModel}
            </p>
          )}

          {modelsError && (
            <p className="mt-3 text-xs leading-5" style={{ color: '#ff9c9c' }}>
              {modelsError}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
