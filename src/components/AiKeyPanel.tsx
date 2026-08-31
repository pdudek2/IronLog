import { useEffect, useId, useState } from 'react'
import { Eye, EyeOff, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Input } from './ui'
import {
  clearClaudeApiKey,
  clearClaudeModel,
  getClaudeApiKey,
  getClaudeModel,
  setClaudeApiKey,
  setClaudeModel,
} from '../lib/aiKeyStorage'
import { AiApiError, fetchAvailableClaudeModels, type ClaudeModelOption } from '../lib/chatService'

interface AiKeyPanelProps {
  id?: string
  onConfiguredChange?: (configured: boolean) => void
  collapsed?: boolean
  onExpand?: () => void
  onCollapse?: () => void
}

function getAiErrorCode(error: unknown): string | undefined {
  if (error instanceof AiApiError) return error.code
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

export default function AiKeyPanel({
  id,
  onConfiguredChange,
  collapsed = false,
  onExpand,
  onCollapse,
}: AiKeyPanelProps) {
  const keyInputId = useId()
  const modelSelectId = useId()
  const modelsErrorId = useId()
  const [draft, setDraft] = useState(() => getClaudeApiKey())
  const [savedKey, setSavedKey] = useState(() => getClaudeApiKey())
  const [selectedModel, setSelectedModel] = useState(() => getClaudeModel())
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<ClaudeModelOption[]>([])
  const [modelsError, setModelsError] = useState<{ message: string; code?: string }>({ message: '' })
  const [loadingModels, setLoadingModels] = useState(false)

  const hasSavedKey = savedKey.length > 0
  const keyRejected = modelsError.code === 'invalid-key'
  const needsAttention = !hasSavedKey || keyRejected || Boolean(modelsError.message)

  useEffect(() => {
    if (!savedKey) return

    let cancelled = false

    async function loadModels() {
      setLoadingModels(true)
      setModelsError({ message: '' })

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
        onConfiguredChange?.(true)
      } catch (nextError) {
        if (cancelled) return
        const code = getAiErrorCode(nextError)
        setModelsError({
          message: nextError instanceof Error ? nextError.message : 'Nie udało się pobrać modeli Claude.',
          code,
        })
        onConfiguredChange?.(code !== 'invalid-key')
      } finally {
        if (!cancelled) setLoadingModels(false)
      }
    }

    void loadModels()

    return () => {
      cancelled = true
    }
  }, [onConfiguredChange, savedKey])

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
    setModelsError({ message: '' })
    setShowKey(false)
    setSaved(false)
    setError('')
    onConfiguredChange?.(false)
  }

  if (collapsed) {
    return (
      <section id={id} className="ai-key-panel ai-key-panel--collapsed">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-white">Klucz Claude</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              {hasSavedKey
                ? needsAttention
                  ? 'Wymaga sprawdzenia.'
                  : 'Zapisany lokalnie w tej przeglądarce.'
                : 'Nie zapisano lokalnie.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onExpand}>
              Ustawienia
            </Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id={id} className="ai-key-panel">
      <div className="ai-key-panel-head">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white">Klucz Claude</h2>
          <p className="ai-key-panel-description mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Zapis lokalny w tej przeglądarce. Odblokowuje rozmowę i generator planu.
          </p>
        </div>

        <div className="ai-key-panel-actions">
          {onCollapse && (
            <Button type="button" variant="ghost" onClick={onCollapse}>
              {hasSavedKey ? 'Zwiń' : 'Anuluj'}
            </Button>
          )}
        </div>
      </div>

      <div className="ai-key-flow">
        <div className="grid gap-2">
          <label htmlFor={keyInputId} className="stat-meta">Twój klucz</label>
          <div className="ai-key-entry">
            <Input
              id={keyInputId}
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

            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowKey((current) => !current)}
              aria-label={showKey ? 'Ukryj klucz' : 'Pokaż klucz'}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
            <Button type="button" onClick={handleSave}>
              {saved ? 'Zapisano klucz' : hasSavedKey ? 'Zaktualizuj klucz' : 'Zapisz klucz'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              disabled={!hasSavedKey && draft.length === 0}
              aria-label="Usuń lokalnie zapisany klucz"
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </div>

        <p className="ai-key-local-note">
          <ShieldCheck size={14} aria-hidden="true" />
          Klucz zostaje tylko na tym urządzeniu.
        </p>

        {hasSavedKey && (
          <div className="ai-key-model">
            <div className="min-w-0">
              <label htmlFor={modelSelectId} className="text-sm font-semibold text-white">
                Model Claude
              </label>
            </div>

            {loadingModels && (
              <span role="status" className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Ładowanie...
              </span>
            )}
            <select
              id={modelSelectId}
              value={selectedModel}
              disabled={!hasSavedKey || loadingModels || models.length === 0}
              aria-invalid={keyRejected ? true : undefined}
              aria-describedby={modelsError.message ? modelsErrorId : undefined}
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
                  Brak dostępnych modeli
                </option>
              ) : (
                models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))
              )}
            </select>

          {modelsError.message && (
            <p id={modelsErrorId} role="alert" className="ai-key-model-error">
              {modelsError.message}
            </p>
          )}
          </div>
        )}
      </div>
    </section>
  )
}
