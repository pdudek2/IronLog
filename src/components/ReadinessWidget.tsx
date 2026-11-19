import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../store/authStore'
import {
  getReadiness,
  saveReadiness,
  todayKey,
  type ReadinessEntry,
} from '../lib/readinessService'
import { NORMAL_DAY, ROUGH_DAY } from '../shared/readiness'
import type { DataState } from '../types/dataState'

interface ReadinessResource {
  key: string
  state: DataState<ReadinessEntry | null>
}

interface ReadinessWidgetProps {
  onStateChange?: (state: DataState<ReadinessEntry | null>) => void
  // null keeps today's entry loading for Train without a line: there is no plan day to ease.
  rough: boolean | null
}

function resourceKey(uid: string, date: string): string {
  return `${uid}:${date}`
}

// A quiet line under the plan instead of a survey: one tap takes a set off each exercise, Undo brings it back.
export default function ReadinessWidget({
  onStateChange,
  rough,
}: ReadinessWidgetProps) {
  const { user } = useAuthStore()
  const initialDate = todayKey()
  const [resource, setResource] = useState<ReadinessResource>({
    key: user ? resourceKey(user.uid, initialDate) : '',
    state: { status: 'loading' },
  })
  const [saving, setSaving] = useState(false)
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

  async function choose() {
    if (!user || saving || rough === null) return
    const uid = user.uid
    setSaving(true)
    try {
      const saved = await saveReadiness(uid, rough ? NORMAL_DAY : ROUGH_DAY)
      if (!mountedRef.current || saved.userId !== useAuthStore.getState().user?.uid) return
      const savedKey = resourceKey(saved.userId, saved.date)
      requestedKeyRef.current = savedKey
      const next = { status: 'success', data: saved } as const
      setResource({ key: savedKey, state: next })
      onStateChange?.(next)
    } catch {
      toast.error('Could not save today’s check-in. Try again.')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  if (rough === null) return null
  // The line keeps its height while today's entry loads, so the links under it stay put.
  if (state.status === 'loading') return <div className="train-rough" aria-hidden="true" />
  if (state.status === 'error') {
    return (
      <div className="train-rough" role="alert">
        <span>Could not load today’s check-in.</span>
        <button type="button" onClick={handleRetry}>Try again</button>
      </div>
    )
  }

  return (
    <div className="train-rough">
      <button type="button" onClick={() => { void choose() }} disabled={saving} aria-label={rough ? 'Rough day. Undo' : 'Rough day? Ease the session'}>
        <span>{rough ? 'Rough day · ' : 'Rough day? '}</span>
        <strong>{saving ? 'Saving…' : rough ? 'Undo' : 'Ease the session'}</strong>
        {!rough && !saving && <ChevronRight size={14} aria-hidden="true" />}
      </button>
    </div>
  )
}
