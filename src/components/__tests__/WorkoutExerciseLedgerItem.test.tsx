import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkoutStore } from '../../store/workoutStore'
import WorkoutExerciseLedgerItem from '../workout/WorkoutExerciseLedgerItem'

const callbacks = {
  onAddSet: vi.fn(),
  onAdjustSet: vi.fn(),
  onApplySuggestion: vi.fn(),
  onDismissSuggestion: vi.fn(),
  onExpandExercise: vi.fn(),
  onRemoveExercise: vi.fn(),
  onRemoveSet: vi.fn(),
  onToggleSet: vi.fn(),
  onUpdateSet: vi.fn(),
}

describe('WorkoutExerciseLedgerItem weight units', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('shows pounds in the input while sending kilograms back to the workout store boundary', () => {
    render(
      <WorkoutExerciseLedgerItem
        exerciseAccent="#fff"
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        fallbackExercise={null}
        focusSetIndex={0}
        hintDismissed
        hintKey="global:bench-press"
        isCollapsible
        isExpanded
        isFocusedExercise
        suggestion={null}
        units="lbs"
        {...callbacks}
      />,
    )

    const weightInput = screen.getByRole('spinbutton', {
      name: 'Ciężar, Bench Press, seria 1, lbs',
    })

    expect(weightInput).toHaveValue(132.3)
    expect(screen.getByText('1.1k lbs')).toBeInTheDocument()

    fireEvent.change(weightInput, { target: { value: '100' } })

    expect(callbacks.onUpdateSet).toHaveBeenCalledWith(0, 0, 'weight', '45.3592')
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
        exerciseAccent="#fff"
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        fallbackExercise={null}
        focusSetIndex={0}
        hintDismissed
        hintKey="global:bench-press"
        isCollapsible
        isExpanded
        isFocusedExercise
        suggestion={null}
        units="kg"
        {...callbacks}
      />,
    )

    expect(screen.getByRole('spinbutton', {
      name: 'Ciężar, Bench Press, seria 1, kg',
    })).toHaveValue(82.25)
    expect(screen.getByText('82.25 kg')).toBeInTheDocument()
  })

  it('groups quick adjustments for the focused set and preserves callback values', () => {
    render(
      <WorkoutExerciseLedgerItem
        exerciseAccent="#f0435a"
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        fallbackExercise={null}
        focusSetIndex={0}
        hintDismissed
        hintKey="global:bench-press"
        isCollapsible
        isExpanded
        isFocusedExercise
        suggestion={null}
        units="kg"
        {...callbacks}
      />,
    )

    const adjustments = screen.getByRole('group', {
      name: 'Szybka korekta serii 1',
    })
    fireEvent.click(within(adjustments).getByRole('button', { name: /o 2.5/ }))
    fireEvent.click(within(adjustments).getByRole('button', { name: /o 1/ }))

    expect(callbacks.onAdjustSet).toHaveBeenNthCalledWith(1, 0, 0, 'weight', 2.5)
    expect(callbacks.onAdjustSet).toHaveBeenNthCalledWith(2, 0, 0, 'reps', 1)
  })

  it('lets a compact exercise request expansion without hiding its identity', () => {
    render(
      <WorkoutExerciseLedgerItem
        exerciseAccent="#f0435a"
        exerciseClientId="exercise-1"
        exerciseIndex={0}
        fallbackExercise={null}
        focusSetIndex={0}
        hintDismissed
        hintKey="global:bench-press"
        isCollapsible
        isExpanded={false}
        isFocusedExercise={false}
        suggestion={null}
        units="kg"
        {...callbacks}
      />,
    )

    const expandButton = screen.getByRole('button', { name: 'Rozwiń ćwiczenie Bench Press' })
    expect(expandButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(expandButton)

    expect(callbacks.onExpandExercise).toHaveBeenCalledWith('exercise-1')
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
  })
})
