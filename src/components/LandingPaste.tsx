import { useState } from 'react'
import LandingCompression from './LandingCompression'
import { landingDays, type LandingDay } from '../shared/landingDay'

// The parser loads only when someone pastes; the page itself stays light.
async function readPlan(text: string): Promise<{ days: LandingDay[]; unread: number }> {
  const { parsePlanText } = await import('../shared/planText')
  const parsed = parsePlanText(text)
  return { days: landingDays(parsed), unread: parsed.skipped.filter((line) => line.reason !== 'comment' && line.reason !== 'warmUp' && line.reason !== 'emptyDay').length }
}

export default function LandingPaste() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ days: LandingDay[]; unread: number } | null>(null)
  const [dayIndex, setDayIndex] = useState(0)
  const [error, setError] = useState('')

  async function show(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!text.trim()) {
      setError('Paste a plan first, one exercise per line.')
      return
    }
    const read = await readPlan(text)
    if (!read.days.length) {
      setResult(null)
      setError('No exercises found. Put one exercise per line, like “Squat 3x5 100”.')
      return
    }
    setError('')
    setDayIndex(0)
    setResult(read)
  }

  const day = result?.days[dayIndex]

  return (
    <div className="landing-paste">
      <form onSubmit={show} className="landing-paste-form">
        <label htmlFor="landing-plan">Your plan</label>
        <textarea
          id="landing-plan"
          value={text}
          onChange={(event) => { setText(event.target.value); setError('') }}
          rows={7}
          spellCheck={false}
          placeholder={'Push\nBench press 4x6 80\nIncline dumbbell press 3x10 26\nLateral raise 3x15 10'}
          aria-describedby={error ? 'landing-plan-error' : undefined}
        />
        {error && <p id="landing-plan-error" className="landing-paste-error" role="alert">{error}</p>}
        <button type="submit" className="ui-button ui-button--ghost">Show my short day</button>
      </form>

      {result && day && (
        <div className="landing-paste-result">
          {result.days.length > 1 && (
            <div className="landing-paste-days" role="radiogroup" aria-label="Day">
              {result.days.map((entry, index) => (
                <button key={`${entry.name}-${index}`} type="button" role="radio" aria-checked={index === dayIndex} onClick={() => setDayIndex(index)}>
                  {entry.name}
                </button>
              ))}
            </div>
          )}
          <LandingCompression key={dayIndex} day={day} playing={false} label="Your plan" />
          {result.unread > 0 && <p className="landing-paste-note">{result.unread} {result.unread === 1 ? 'line' : 'lines'} not read</p>}
        </div>
      )}
    </div>
  )
}
