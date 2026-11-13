import { useEffect, useState } from 'react'
import LandingCompression from './LandingCompression'
import { landingDays, type LandingDay } from '../shared/landingDay'

// The parser is its own chunk, loaded after the page has rendered.
async function readPlan(text: string): Promise<{ days: LandingDay[]; unread: number }> {
  const { parsePlanText } = await import('../shared/planText')
  const parsed = parsePlanText(text)
  return { days: landingDays(parsed), unread: parsed.skipped.filter((line) => line.reason !== 'comment' && line.reason !== 'warmUp' && line.reason !== 'emptyDay').length }
}

const NOTE = 'push\nbench 4x6 80\nincline db 3x10 26\nohp 3x8 40\nwznosy bokiem 3x15 10\nfrench press 3x12 30\ndipy 3x8'

export default function LandingPaste() {
  const [text, setText] = useState(NOTE)
  const [result, setResult] = useState<{ days: LandingDay[]; unread: number } | null>(null)
  const [run, setRun] = useState(0)
  const [dayIndex, setDayIndex] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    void readPlan(NOTE).then((read) => setResult((shown) => shown ?? read))
  }, [])

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
    setRun((value) => value + 1)
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
          aria-describedby={error ? 'landing-plan-error' : undefined}
        />
        {error && <p id="landing-plan-error" className="landing-paste-error" role="alert">{error}</p>}
        <button type="submit" className="ui-button ui-button--primary">Show my short day</button>
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
          <LandingCompression key={`${run}-${dayIndex}`} day={day} playing={false} label="From your note" />
          {result.unread > 0 && <p className="landing-paste-note">{result.unread} {result.unread === 1 ? 'line' : 'lines'} not read</p>}
        </div>
      )}
    </div>
  )
}
