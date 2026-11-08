import { useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '../store/authStore'
import { saveReadiness, type ReadinessEntry } from '../lib/readinessService'

interface Props {
  entry?: ReadinessEntry | null
  onSaved: (entry: ReadinessEntry) => void
}

type Field = 'sleep' | 'mood' | 'soreness'

// Soreness runs the other way from sleep and mood, so every step names its meaning.
const FIELDS: { key: Field; label: string; words: [string, string, string, string, string] }[] = [
  { key: 'sleep', label: 'Sleep', words: ['Poor', 'Restless', 'Okay', 'Good', 'Great'] },
  { key: 'mood', label: 'Mood', words: ['Bad', 'Low', 'Okay', 'Good', 'Great'] },
  { key: 'soreness', label: 'Soreness', words: ['None', 'Light', 'Some', 'Sore', 'Severe'] },
]

export default function ReadinessPrompt({ entry = null, onSaved }: Props) {
  const { user } = useAuthStore()
  const [values, setValues] = useState(() => ({ sleep: entry?.sleep ?? 3, mood: entry?.mood ?? 3, soreness: entry?.soreness ?? 3 }))
  const [saving, setSaving] = useState(false)

  // Each tap saves today's entry, so the check-in never stands between the user and Start.
  async function choose(key: Field, value: number) {
    const next = { ...values, [key]: value }
    setValues(next)
    if (!user) return
    setSaving(true)
    try {
      onSaved(await saveReadiness(user.uid, next))
    } catch {
      toast.error('Could not save the check-in.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="train-checkin">
      <summary data-today-readiness>
        {entry ? (
          <span className="train-checkin-line">
            Sleep {entry.sleep} · Mood {entry.mood} · Soreness {entry.soreness}
          </span>
        ) : (
          <span className="train-checkin-line">
            How’s today? <small>Sleep, mood, soreness</small>
          </span>
        )}
        <span className="train-checkin-act" data-closed>{entry ? 'Change' : 'Check in'}</span>
        <span className="train-checkin-act" data-open>Close</span>
        <ChevronUp size={16} aria-hidden="true" />
      </summary>

      <div className="train-checkin-body">
        {FIELDS.map(({ key, label, words }) => (
          <fieldset key={key} className="train-checkin-scale">
            <legend>
              {label} <small>{words[values[key] - 1]}</small>
            </legend>
            <div>
              {words.map((word, index) => (
                <label key={word} className="workout-set-step">
                  <input
                    type="radio"
                    name={`readiness-${key}`}
                    value={index + 1}
                    checked={values[key] === index + 1}
                    onChange={() => { void choose(key, index + 1) }}
                    aria-label={`${label} ${index + 1} of 5, ${word}`}
                  />
                  {index + 1}
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <p className="train-checkin-note" aria-live="polite">{saving ? 'Saving…' : entry ? 'Saved for today' : 'Tap to save for today'}</p>
      </div>
    </details>
  )
}
