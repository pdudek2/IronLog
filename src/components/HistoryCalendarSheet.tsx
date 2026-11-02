import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import BottomSheet from './BottomSheet'
import { monthCalendar } from '../shared/monthCalendar'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface HistoryCalendarSheetProps {
  workouts: { id: string; startedAt: number }[]
  onOpenWorkout: (workoutId: string) => void
  onClose: () => void
}

export default function HistoryCalendarSheet({ workouts, onOpenWorkout, onClose }: HistoryCalendarSheetProps) {
  const [offset, setOffset] = useState(0)
  const { label, leadingBlanks, days } = monthCalendar(offset, workouts)

  return (
    <BottomSheet title={label} onClose={onClose}>
      <div className="history-calendar-nav">
        <button type="button" aria-label="Previous month" onClick={() => setOffset(offset - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Next month" disabled={offset === 0} onClick={() => setOffset(offset + 1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="history-calendar">
        {WEEKDAYS.map((day, index) => <span key={index} aria-hidden="true">{day}</span>)}
        {Array.from({ length: leadingBlanks }, (_, index) => <i key={index} />)}
        {days.map(({ day, today, workoutId }) => (
          <button
            key={day}
            type="button"
            disabled={!workoutId}
            data-today={today || undefined}
            aria-label={workoutId ? `Open workout from ${label.split(' ')[0]} ${day}` : undefined}
            onClick={() => { if (workoutId) onOpenWorkout(workoutId) }}
          >
            {day}
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
