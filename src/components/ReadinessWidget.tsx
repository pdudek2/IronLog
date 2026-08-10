import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import {
  computeReadinessScore,
  getReadiness,
  todayKey,
  type ReadinessEntry,
} from '../lib/readinessService'
import type { DataState } from '../types/dataState'
import ReadinessPrompt from './ReadinessPrompt'
import Button from './ui/Button'

interface ReadinessResource {
  key: string
  state: DataState<ReadinessEntry | null>
}

interface ReadinessWidgetProps {
  onStateChange?: (state: DataState<ReadinessEntry | null>) => void
  renderSaved?: (entry: ReadinessEntry) => ReactNode
}

function resourceKey(uid: string, date: string): string {
  return `${uid}:${date}`
}

export default function ReadinessWidget({
  onStateChange,
  renderSaved,
}: ReadinessWidgetProps) {
  const { user } = useAuthStore()
  const initialDate = todayKey()
  const [resource, setResource] = useState<ReadinessResource>({
    key: user ? resourceKey(user.uid, initialDate) : '',
    state: { status: 'loading' },
  })
  const mountedRef = useRef(false)
  const requestIdRef = useRef(0)
  const requestedKeyRef = useRef('')
  const inFlightKeyRef = useRef('')

  const loadReadiness = useCallback((uid: string, date: string) => {
    const key = resourceKey(uid, date)
    if (inFlightKeyRef.current === key) return

    const requestId = ++requestIdRef.current
    inFlightKeyRef.current = key
    getReadiness(uid, date)
      .then((data) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        const state = { status: 'success', data } as const
        setResource({ key, state })
        onStateChange?.(state)
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || requestId !== requestIdRef.current) return
        console.error('[ReadinessWidget] load failed', error)
        const state = { status: 'error', error } as const
        setResource({ key, state })
        onStateChange?.(state)
      })
      .finally(() => {
        if (requestId === requestIdRef.current) inFlightKeyRef.current = ''
      })
  }, [onStateChange])

  useEffect(() => {
    if (!user) return
    mountedRef.current = true

    const requestCurrentDay = () => {
      const date = todayKey()
      const key = resourceKey(user.uid, date)
      if (requestedKeyRef.current === key) return
      requestedKeyRef.current = key
      loadReadiness(user.uid, date)
    }

    requestCurrentDay()

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const date = todayKey()
      const key = resourceKey(user.uid, date)
      if (requestedKeyRef.current === key) return
      requestedKeyRef.current = key
      const state = { status: 'loading' } as const
      setResource({ key, state })
      onStateChange?.(state)
      loadReadiness(user.uid, date)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadReadiness, onStateChange, user])

  const date = todayKey()
  const key = user ? resourceKey(user.uid, date) : ''
  const state: DataState<ReadinessEntry | null> = resource.key === key
    ? resource.state
    : { status: 'loading' }

  function handleRetry() {
    if (!user) return
    const retryDate = todayKey()
    const retryKey = resourceKey(user.uid, retryDate)
    requestedKeyRef.current = retryKey
    const state = { status: 'loading' } as const
    setResource({ key: retryKey, state })
    onStateChange?.(state)
    loadReadiness(user.uid, retryDate)
  }

  function handleSaved(saved: ReadinessEntry) {
    if (saved.userId !== useAuthStore.getState().user?.uid) return
    const savedKey = resourceKey(saved.userId, saved.date)
    requestedKeyRef.current = savedKey
    const state = { status: 'success', data: saved } as const
    setResource({
      key: savedKey,
      state,
    })
    onStateChange?.(state)
  }

  if (state.status === 'loading') {
    return (
      <div
        className="readiness-card readiness-card--loading animate-pulse"
        style={{ minHeight: '5rem' }}
      />
    )
  }

  if (state.status === 'error') {
    return (
      <motion.div
        className="readiness-card"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <p className="text-sm font-semibold text-white">
          Nie udało się wczytać gotowości
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          Sprawdź połączenie i spróbuj ponownie.
        </p>
        <Button type="button" className="mt-4" onClick={handleRetry}>
          Spróbuj ponownie
        </Button>
      </motion.div>
    )
  }

  if (state.data === null) {
    return (
      <ReadinessPrompt
        onSaved={handleSaved}
      />
    )
  }

  const entry = state.data
  const customSavedState = renderSaved?.(entry)
  if (customSavedState !== undefined && customSavedState !== null) {
    return customSavedState
  }

  const { score, color, label } = computeReadinessScore(entry)

  return (
    <motion.div
      className="readiness-card readiness-card--saved"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <p className="eyebrow mb-3" style={{ color: 'var(--accent)' }}>Gotowość</p>

      <div className="flex items-center gap-4">
        <div className="relative flex-none">
          <svg width="62" height="62" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            <motion.circle
              cx="50" cy="50" r="40" fill="none"
              stroke={color}
              strokeWidth="8" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 40}
              transform="rotate(-90 50 50)"
              initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - score / 100) }}
              transition={{ delay: 0.1, duration: 0.8, ease: 'easeOut' }}
            />
            <text x="50" y="54" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily="Instrument Sans">
              {score}
            </text>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white leading-tight">{label}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>dzisiejszy wynik</p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: 'Sen', value: entry.sleep },
              { label: 'Nastrój', value: entry.mood },
              { label: 'DOMS', value: entry.soreness },
            ].map(({ label: l, value }) => (
              <div key={l}>
                <p className="stat-meta">{l}</p>
                <p className="mt-1 text-sm font-semibold text-white tabular-nums">{value}/5</p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(value / 5) * 100}%` }}
                    transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
