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
  { key: 'sleep',    label: 'Sleep',      lowLabel: 'Poor',    highLabel: 'Great' },
  { key: 'mood',     label: 'Mood',  lowLabel: 'Bad',      highLabel: 'Great' },
  { key: 'soreness', label: 'DOMS',     lowLabel: 'None',     highLabel: 'Severe' },
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
      toast.success('Readiness saved')
      onSaved(entry)
    } catch {
      toast.error('Could not save readiness.')
      setSaving(false)
    }
  }

  return (
    <motion.details
      className="readiness-card readiness-card--prompt"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <summary className="readiness-summary">
        <div>
          <span>Readiness · optional</span>
          <strong>Adjust today’s workout</strong>
          <small>Sleep, mood and soreness</small>
        </div>
        <span className="readiness-summary-action">Check in</span>
      </summary>

      <div className="readiness-prompt-body">
        <div className="space-y-3">
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
                aria-label={`Readiness: ${label}`}
                aria-valuetext={`${values[key]} out of 5`}
                min={1}
                max={5}
                step={1}
                value={values[key]}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                className="readiness-slider w-full"
                style={{ touchAction: 'manipulation' }}
              />
              <div className="readiness-scale flex justify-between mt-1">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{lowLabel}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{highLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <motion.button
          onClick={handleSave}
          disabled={saving}
          className="readiness-save"
          whileTap={{ scale: 0.98 }}
        >
          {saving ? 'Saving...' : 'Save score'}
        </motion.button>
      </div>
    </motion.details>
  )
}
