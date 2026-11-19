import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CollapsedExercise, GroupBlock } from '../workout/SessionList'
import type { ActiveWorkout, WorkoutExercise } from '../../store/workoutStore'

vi.mock('../../lib/exerciseDetailService', () => ({
  getExerciseSessions: () => Promise.resolve([]),
}))

const member = (exerciseId: string, name: string, done: number, total: number): WorkoutExercise => ({
  clientId: exerciseId, exerciseId, exerciseSource: 'global', name, group: 'g1',
  sets: Array.from({ length: total }, (_, index) => ({ clientId: `${exerciseId}-${index}`, weight: '70', reps: '8', done: index < done })),
})

describe('session list', () => {
  it('shows a pair in rounds with the rest between them, the cut rounds and one Add round', () => {
    const session: ActiveWorkout = {
      sessionId: 's', startedAt: 1,
      exercises: [member('leg-curl', 'Leg Curl', 1, 2), member('hip-abduction', 'Hip Abduction', 0, 2)],
      compression: {
        v: 1, budgetMin: null, mode: 'compressed', shortRest: false, estimateMin: 10, fullEstimateMin: 14, factor: 1, samples: 0, calibration: 'none', readiness: null,
        exercises: [
          { dayExerciseIndex: 0, exerciseId: 'leg-curl', exerciseSource: 'global', plannedSets: 3, sets: 2 },
          { dayExerciseIndex: 1, exerciseId: 'hip-abduction', exerciseSource: 'global', plannedSets: 3, sets: 2 },
        ],
      },
    }
    const on = { onSelect: vi.fn(), onRemove: vi.fn(), onAddRound: vi.fn() }
    render(<GroupBlock session={session} indices={[0, 1]} currentIndex={1} panelSet={0} units="kg" userExercises={new Map()} metaOf={() => 'Legs · Machine'} drawnSetId={null} {...on} />)

    expect(screen.getByRole('region', { name: 'Superset, 2 rounds' })).toBeInTheDocument()
    const rows = screen.getAllByRole('button', { name: /^\d[AB],/ })
    expect(rows.map((row) => row.getAttribute('aria-label')?.split(',')[0])).toEqual(['1A', '1B', '2A', '2B'])
    expect(rows[0]).toHaveAccessibleName(/logged$/)
    expect(rows[1]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText(/^rest \d:\d\d$/)).toHaveLength(1)
    expect(screen.getByText('3A 3B · cut today · was 3 rounds')).toBeInTheDocument()

    fireEvent.click(rows[2]!)
    expect(on.onSelect).toHaveBeenCalledWith(0, 1)
    fireEvent.click(screen.getByRole('button', { name: 'More for Hip Abduction' }))
    expect(on.onRemove).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: /Add round/ }))
    expect(on.onAddRound).toHaveBeenCalledWith([0, 1])
  })

  it('shows another exercise by its target before it starts and by its progress after', () => {
    const exercise = { ...member('squat', 'Squat', 0, 4), group: undefined }
    const onOpen = vi.fn()
    const { rerender } = render(<CollapsedExercise exercise={exercise} units="kg" onOpen={onOpen} />)
    expect(screen.getByRole('button')).toHaveTextContent('Squat4 × 8 · 70 kg')

    rerender(<CollapsedExercise exercise={{ ...exercise, sets: exercise.sets.map((set, index) => ({ ...set, done: index < 2 })) }} units="kg" onOpen={onOpen} />)
    expect(screen.getByRole('button')).toHaveTextContent('Squat2 of 4 sets')
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalled()
  })
})
