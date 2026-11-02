import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkoutSetPanel from '../workout/WorkoutSetPanel'

const handlers = () => ({
  onAdjustSet: vi.fn(),
  onUpdateSet: vi.fn(),
  onToggleSet: vi.fn(),
  onClearSelection: vi.fn(),
  onGoToExercise: vi.fn(),
  onFinish: vi.fn(),
})

const base = {
  exerciseIndex: 1,
  exerciseName: 'Bench Press',
  setIndex: 2,
  setCount: 4,
  units: 'kg' as const,
  rest: null,
  openSetIndex: 2,
  nextExercise: null,
  finishing: false,
}

describe('WorkoutSetPanel', () => {
  it('edits a done set without logging it and returns to the open set', () => {
    const on = handlers()
    const { rerender } = render(<WorkoutSetPanel {...base} {...on} setIndex={0} set={{ weight: '80', reps: '6', done: true }} />)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Weight, Bench Press, set 1, kg' }), { target: { value: '82.5' } })
    expect(on.onUpdateSet).toHaveBeenCalledWith(1, 0, 'weight', '82.5')
    expect(screen.queryByRole('button', { name: /Log set/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to set 3' }))
    expect(on.onClearSelection).toHaveBeenCalled()

    rerender(<WorkoutSetPanel {...base} {...on} openSetIndex={-1} setIndex={0} set={{ weight: '80', reps: '6', done: true }} />)
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('logs the current set and steps its weight and reps', () => {
    const on = handlers()
    render(<WorkoutSetPanel {...base} {...on} set={{ weight: '80', reps: '6', done: false }} />)

    expect(screen.getByText('Set 3 of 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log set 3 for Bench Press' }))
    expect(on.onToggleSet).toHaveBeenCalledWith(1, 2)

    fireEvent.click(screen.getByRole('button', { name: 'Adjust weight by 2.5' }))
    expect(on.onAdjustSet).toHaveBeenLastCalledWith(1, 2, 'weight', 2.5)
    fireEvent.click(screen.getByRole('button', { name: 'Adjust weight by -2.5' }))
    expect(on.onAdjustSet).toHaveBeenLastCalledWith(1, 2, 'weight', -2.5)
    fireEvent.click(screen.getByRole('button', { name: 'Adjust reps by 1' }))
    expect(on.onAdjustSet).toHaveBeenLastCalledWith(1, 2, 'reps', 1)
    fireEvent.click(screen.getByRole('button', { name: 'Adjust reps by -1' }))
    expect(on.onAdjustSet).toHaveBeenLastCalledWith(1, 2, 'reps', -1)
  })

  it('shows pounds in the input while sending kilograms back to the workout store boundary', () => {
    const on = handlers()
    render(<WorkoutSetPanel {...base} {...on} units="lbs" set={{ weight: '60', reps: '6', done: false }} />)

    const weightInput = screen.getByRole('spinbutton', { name: 'Weight, Bench Press, set 3, lbs' })
    expect(weightInput).toHaveValue(132.3)
    fireEvent.change(weightInput, { target: { value: '100' } })
    expect(on.onUpdateSet).toHaveBeenCalledWith(1, 2, 'weight', '45.3592')

    const repsInput = screen.getByRole('spinbutton', { name: 'Reps, Bench Press, set 3' })
    expect(repsInput).toHaveValue(6)
    fireEvent.change(repsInput, { target: { value: '8' } })
    expect(on.onUpdateSet).toHaveBeenCalledWith(1, 2, 'reps', '8')

    fireEvent.click(screen.getByRole('button', { name: 'Adjust weight by 2.5' }))
    expect(on.onAdjustSet).toHaveBeenCalledWith(1, 2, 'weight', 2.5 / 2.2046226218)
  })

  it('keeps the entered kilogram precision', () => {
    render(<WorkoutSetPanel {...base} {...handlers()} set={{ weight: '82.25', reps: '6', done: false }} />)

    expect(screen.getByRole('spinbutton', { name: 'Weight, Bench Press, set 3, kg' })).toHaveValue(82.25)
  })

  it('offers the next exercise when this one is done', () => {
    const on = handlers()
    render(<WorkoutSetPanel {...base} {...on} set={null} nextExercise={{ index: 3, name: 'Row' }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Go to Row' }))
    expect(on.onGoToExercise).toHaveBeenCalledWith(3)
  })

  it('offers Finish when every set is done', () => {
    const on = handlers()
    render(<WorkoutSetPanel {...base} {...on} set={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }))
    expect(on.onFinish).toHaveBeenCalled()
  })
})
