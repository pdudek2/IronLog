import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import {
  computeReadinessScore,
  getTodayReadiness,
  todayKey,
  type ReadinessEntry,
} from '../lib/readinessService'
import ReadinessPrompt from './ReadinessPrompt'

export default function ReadinessWidget() {
  const { user } = useAuthStore()
  const [entry, setEntry] = useState<ReadinessEntry | null | undefined>(undefined) // undefined = loading
  const [lastCheckedDate, setLastCheckedDate] = useState<string>('')

  useEffect(() => {
    if (!user) return

    function load() {
      const today = todayKey()
      setLastCheckedDate(today)
      getTodayReadiness(user!.uid)
        .then(setEntry)
        .catch((err) => {
          console.error('[ReadinessWidget] load failed', err)
          setEntry(null)
        })
    }

    load()

    // Re-fetch jeśli tab był otwarty przez noc i data się zmieniła
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && todayKey() !== lastCheckedDate) {
        load()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [user, lastCheckedDate])

  // loading
  if (entry === undefined) {
    return (
      <div
        className="surface-panel rounded-[var(--radius-xl)] p-5 animate-pulse"
        style={{ minHeight: '80px' }}
      />
    )
  }

  // brak wpisu — pokaż formularz
  if (entry === null) {
    return <ReadinessPrompt onSaved={(saved) => setEntry(saved)} />
  }

  // jest wpis — pokaż score
  const { score, color, label } = computeReadinessScore(entry)

  return (
    <motion.div
      className="surface-panel rounded-[var(--radius-xl)] p-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <p className="eyebrow mb-3" style={{ color: 'var(--accent)' }}>Gotowość</p>

      <div className="flex items-center gap-4">
        <div className="relative flex-none">
          <svg width="72" height="72" viewBox="0 0 100 100">
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
            <text x="50" y="54" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily="Urbanist">
              {score}
            </text>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold text-white leading-tight">{label}</p>
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
