import { useEffect, useId, useState } from 'react'
import { Eye, EyeOff, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Input } from './ui'
import {
  clearOpenRouterApiKey,
  clearOpenRouterModel,
  getOpenRouterApiKey,
  getOpenRouterModel,
  setOpenRouterApiKey,
  setOpenRouterModel,
} from '../lib/aiKeyStorage'
import { AiApiError, fetchAvailableOpenRouterModels, type OpenRouterModelOption } from '../lib/chatService'

import { useAuthStore } from '../store/authStore'

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

export default function AiKeyPanel(props: AiKeyPanelProps) {
  const { user, loading } = useAuthStore()
  if (loading || !user || user.isAnonymous) return null
  return <AccountAiKeyPanel key={user.uid} {...props} />
}

function AccountAiKeyPanel({
  id,
  onConfiguredChange,
  collapsed = false,
  onExpand,
  onCollapse,
}: AiKeyPanelProps) {
  const keyInputId = useId()
  const modelSelectId = useId()
  const modelsErrorId = useId()
  const [draft, setDraft] = useState(() => getOpenRouterApiKey())
  const [savedKey, setSavedKey] = useState(() => getOpenRouterApiKey())
  const [selectedModel, setSelectedModel] = useState(() => getOpenRouterModel())
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<OpenRouterModelOption[]>([])
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
        const nextModels = await fetchAvailableOpenRouterModels(savedKey)
        if (cancelled) return
        setModels(nextModels)

        const currentModel = getOpenRouterModel()
        const fallbackModel = nextModels[0]?.id ?? ''
        const nextSelected = nextModels.some((model) => model.id === currentModel)
          ? currentModel
          : fallbackModel

        setSelectedModel(nextSelected)
        if (nextSelected) setOpenRouterModel(nextSelected)
        onConfiguredChange?.(true)
      } catch (nextError) {
        if (cancelled) return
        const code = getAiErrorCode(nextError)
        setModelsError({
          message: nextError instanceof Error ? nextError.message : 'Could not load OpenRouter models.',
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
      setError('This key looks too short. Paste your full OpenRouter API key.')
      setSaved(false)
      return
    }

    const nextKey = setOpenRouterApiKey(normalized)
    setSavedKey(nextKey)
    setDraft(nextKey)
    setError('')
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  function handleClear() {
    clearOpenRouterApiKey()
    clearOpenRouterModel()
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
            <h2 className="text-lg font-semibold text-white">OpenRouter key</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
              {hasSavedKey
                ? needsAttention
                  ? 'Needs verification.'
                  : 'Saved locally in this browser.'
                : 'Not saved locally.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onExpand}>
              Settings
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
          <h2 className="text-xl font-bold text-white">OpenRouter key</h2>
          <p className="ai-key-panel-description mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Your key is stored locally in this browser. AI requests send it through the IronLog server to OpenRouter; IronLog does not store it in the database.
          </p>
        </div>

        <div className="ai-key-panel-actions">
          {onCollapse && (
            <Button type="button" variant="ghost" onClick={onCollapse}>
              {hasSavedKey ? 'Collapse' : 'Cancel'}
            </Button>
          )}
        </div>
      </div>

      <div className="ai-key-flow">
        <div className="grid gap-2">
          <label htmlFor={keyInputId} className="stat-meta">Your key</label>
          <div className="ai-key-entry">
            <Input
              id={keyInputId}
              type={showKey ? 'text' : 'password'}
              placeholder="Paste OpenRouter API key"
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
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
            <Button type="button" onClick={handleSave}>
              {saved ? 'Key saved' : hasSavedKey ? 'Update key' : 'Save key'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              disabled={!hasSavedKey && draft.length === 0}
              aria-label="Remove locally stored key"
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </div>

        <p className="ai-key-local-note">
          <ShieldCheck size={14} aria-hidden="true" />
          Stored locally · sent through IronLog to OpenRouter only for each request.
        </p>

        {hasSavedKey && (
          <div className="ai-key-model">
            <div className="min-w-0">
              <label htmlFor={modelSelectId} className="text-sm font-semibold text-white">
                OpenRouter model
              </label>
            </div>

            {loadingModels && (
              <span role="status" className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Loading...
              </span>
            )}
            <select
              id={modelSelectId}
              value={selectedModel}
              disabled={!hasSavedKey || loadingModels || models.length === 0}
              aria-invalid={keyRejected ? true : undefined}
              aria-describedby={modelsError.message ? modelsErrorId : undefined}
              onChange={(event) => {
                const nextModel = setOpenRouterModel(event.target.value)
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
                  No models available
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
