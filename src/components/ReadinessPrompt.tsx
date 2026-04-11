import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useAuthStore } from '../store/authStore'
import { saveReadiness, type ReadinessEntry } from '../lib/readinessService'

interface Props {
  onSaved: (entry: ReadinessEntry) => void
}

interface SliderField {
  key: 'sleep' | 'mood' | 'soreness'
  label: string
  lowLabel: string
  highLabel: string
}

const FIELDS: SliderField[] = [
  { key: 'sleep',    label: 'Sen',      lowLabel: 'Słaby',    highLabel: 'Świetny' },
  { key: 'mood',     label: 'Nastrój',  lowLabel: 'Zły',      highLabel: 'Świetny' },
  { key: 'soreness', label: 'DOMS',     lowLabel: 'Brak',     highLabel: 'Silny' },
]

export default function ReadinessPrompt({ onSaved }: Props) {
  const { user } = useAuthStore()
  const [values, setValues] = useState({ sleep: 3, mood: 3, soreness: 3 })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!user || saving) return
    setSaving(true)
    try {
      const entry = await saveReadiness(user.uid, values)
      toast.success('Gotowość zapisana')
      onSaved(entry)
    } catch {
      toast.error('Nie udało się zapisać gotowości.')
      setSaving(false)
    }
  }

  return (
    <motion.div
      className="surface-panel rounded-[var(--radius-xl)] p-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <p className="eyebrow mb-1" style={{ color: 'var(--accent)' }}>Gotowość</p>
      <p className="text-sm font-semibold text-white mb-4">Jak się czujesz przed treningiem?</p>

      <div className="space-y-5">
        {FIELDS.map(({ key, label, lowLabel, highLabel }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">{label}</span>
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: 'var(--accent)' }}
              >
                {values[key]}/5
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={values[key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
              className="readiness-slider w-full"
              style={{ touchAction: 'manipulation' }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{lowLabel}</span>
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{highLabel}</span>
            </div>
          </div>
        ))}
      </div>

      <motion.button
        onClick={handleSave}
        disabled={saving}
        className="mt-5 w-full rounded-[var(--radius-lg)] py-3 text-sm font-semibold disabled:opacity-50"
        style={{
          background: 'linear-gradient(180deg, var(--accent) 0%, #3f8ff4 100%)',
          color: 'var(--accent-foreground)',
        }}
        whileTap={{ scale: 0.98 }}
      >
        {saving ? 'Zapisuję...' : 'Zapisz gotowość'}
      </motion.button>
    </motion.div>
  )
}
