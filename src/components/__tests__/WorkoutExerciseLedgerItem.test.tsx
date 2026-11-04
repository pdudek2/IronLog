import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkoutStore } from '../../store/workoutStore'
import WorkoutExerciseLedgerItem from '../workout/WorkoutExerciseLedgerItem'

const mocks = vi.hoisted(() => ({
  getExerciseSessions: vi.fn(),
}))

vi.mock('../../lib/exerciseDetailService', () => ({
  getExerciseSessions: mocks.getExerciseSessions,
}))

const callbacks = {
  onAddSet: vi.fn(),
  onApplySuggestion: vi.fn(),
  onDismissSuggestion: vi.fn(),
  onOpenOverview: vi.fn(),
  drawnSetIndex: null,
  onRemoveSet: vi.fn(),
  onSelectSet: vi.fn(),
  onToggleSet: vi.fn(),
}

describe('WorkoutExerciseLedgerItem weight units', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getExerciseSessions.mockResolvedValue([])
    useWorkoutStore.setState({
      active: {
        sessionId: 'session-1',
        startedAt: 1,
        exercises: [{
          clientId: 'exercise-1',
          exerciseId: 'bench-press',
          exerciseSource: 'global',
          name: 'Bench Press',
          sets: [{
            clientId: 'set-1',
            weight: '60',
            reps: '8',
            done: false,
          }],
        }],
      },
    })
  })

  it('shows the stored kilograms in the display unit and hands editing to the panel', () => {
    render(
      <WorkoutExerciseLedgerItem
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        exerciseCount={3}
        fallbackExercise={null}
        panelSetIndex={1}
        hintDismissed
        hintKey="global:bench-press"
        suggestion={null}
        units="lbs"
        {...callbacks}
      />,
    )

    expect(screen.getByText('132.3 × 8')).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Edit set 1/ }))
    expect(callbacks.onSelectSet).toHaveBeenCalledWith(0)
  })

  it('aligns previous results with their set rows and leaves missing history neutral', async () => {
    const active = useWorkoutStore.getState().active
    if (!active) throw new Error('Expected an active workout fixture.')
    useWorkoutStore.setState({
      active: {
        ...active,
        exercises: active.exercises.map((exercise) => ({
          ...exercise,
          sets: [
            exercise.sets[0],
            { clientId: 'set-2', weight: '80', reps: '8', done: false },
            { clientId: 'set-3', weight: '', reps: '', done: false },
          ],
        })),
      },
    })
    mocks.getExerciseSessions.mockResolvedValue([{
      id: 'previous-session',
      workoutId: 'previous-workout',
      startedAt: 1,
      label: null,
      totalSets: 2,
      totalReps: 20,
      totalVolume: 0,
      bestSetWeight: 225,
      bestSetReps: 12,
      sets: [
        { weight: 225, reps: 12 },
        { weight: 80, reps: 8 },
      ],
    }])

    render(
      <WorkoutExerciseLedgerItem
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        exerciseCount={3}
        fallbackExercise={null}
        panelSetIndex={1}
        hintDismissed
        hintKey="global:bench-press"
        suggestion={null}
        units="lbs"
        userId="user-1"
        {...callbacks}
      />,
    )

    expect(await screen.findByRole('button', { name: /^Edit set 1: last 496 × 12/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Edit set 2: last 176.4 × 8/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Edit set 3: last —/ })).toBeInTheDocument()
    expect(screen.getByText('Last')).toBeInTheDocument()
    expect(screen.queryByText('Vol.')).not.toBeInTheDocument()
    expect(mocks.getExerciseSessions).toHaveBeenCalledWith('user-1', 'bench-press', 'global', 1)
  })

  it('preserves the entered kilogram precision when no conversion is required', () => {
    const active = useWorkoutStore.getState().active
    if (!active) throw new Error('Expected an active workout fixture.')
    useWorkoutStore.setState({
      active: {
        ...active,
        exercises: active.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({ ...set, weight: '82.25', done: true })),
        })),
      },
    })

    render(
      <WorkoutExerciseLedgerItem
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        exerciseCount={3}
        fallbackExercise={null}
        panelSetIndex={0}
        hintDismissed
        hintKey="global:bench-press"
        suggestion={null}
        units="kg"
        {...callbacks}
      />,
    )

    expect(screen.getByText('82.25 × 8')).toBeInTheDocument()
  })

  it('marks the panel set and keeps the tick for logging directly', () => {
    render(
      <WorkoutExerciseLedgerItem
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        exerciseCount={3}
        fallbackExercise={null}
        panelSetIndex={0}
        hintDismissed
        hintKey="global:bench-press"
        suggestion={null}
        units="lbs"
        {...callbacks}
      />,
    )

    expect(screen.getByRole('button', { name: /^Edit set 1/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Exercise 1 of 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark set 1 for Bench Press' }))
    expect(callbacks.onToggleSet).toHaveBeenCalledWith(0, 0)
  })

  it('hides an overload suggestion after every set is completed', () => {
    const suggestion = { label: 'Long break: first set is a test at −2.5 kg', weight: 57.5 }

    render(
      <WorkoutExerciseLedgerItem
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        exerciseCount={3}
        fallbackExercise={null}
        panelSetIndex={0}
        hintDismissed={false}
        hintKey="global:bench-press"
        suggestion={suggestion}
        units="kg"
        {...callbacks}
      />,
    )

    expect(screen.getByText('Long break: first set is a test at −2.5 kg')).toBeInTheDocument()

    const active = useWorkoutStore.getState().active
    if (!active) throw new Error('Expected an active workout fixture.')
    act(() => {
      useWorkoutStore.setState({
        active: {
          ...active,
          exercises: active.exercises.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.map((set) => ({ ...set, done: true })),
          })),
        },
      })
    })

    expect(screen.queryByText('Long break: first set is a test at −2.5 kg')).not.toBeInTheDocument()
  })
})
