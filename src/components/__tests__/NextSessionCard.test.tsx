import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NextSessionCard from '../NextSessionCard'
import type { WorkoutTemplate } from '../../lib/templateService'
import type { WorkoutSummary } from '../../lib/workoutService'

const template: WorkoutTemplate = {
  id: 'template-1',
  userId: 'user-1',
  name: 'Upper / Lower',
  createdAt: 1,
  updatedAt: 2,
  days: [{
    name: 'Upper A',
    exercises: [
      { exerciseId: 'bench', exerciseSource: 'global', name: 'Bench Press', sets: 4, targetReps: 8, targetWeight: 70 },
      { exerciseId: 'row', exerciseSource: 'global', name: 'Barbell Row', sets: 4, targetReps: 8, targetWeight: 65 },
      { exerciseId: 'ohp', exerciseSource: 'global', name: 'Overhead Press', sets: 3, targetReps: 10, targetWeight: 40 },
      { exerciseId: 'pulldown', exerciseSource: 'global', name: 'Lat Pulldown', sets: 3, targetReps: 12, targetWeight: 50 },
    ],
  }],
}

const workouts: WorkoutSummary[] = [{
  id: 'workout-1',
  templateId: template.id,
  label: 'Upper A',
  startedAt: Date.UTC(2026, 7, 9, 8),
  finishedAt: Date.UTC(2026, 7, 9, 9),
  materialized: true,
  exercises: [{
    exerciseId: 'bench',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: 72.5, reps: 8 }],
  }],
}]

describe('NextSessionCard', () => {
  it('keeps the summary compact and orders Start before Edit in the quick-look', () => {
    const onStart = vi.fn()
    const onEdit = vi.fn()

    render(
      <NextSessionCard
        template={template}
        dayIndex={0}
        readiness={{
          userId: 'user-1',
          date: '2026-08-10',
          sleep: 3,
          mood: 3,
          soreness: 3,
          createdAt: 1,
        }}
        workouts={workouts}
        units="kg"
        launching={false}
        onStart={onStart}
        onEdit={onEdit}
      />,
    )

    const summary = screen.getByRole('region', { name: 'Dzisiejszy trening' })
    expect(within(summary).getByRole('heading', { name: 'Upper A' })).toBeInTheDocument()
    expect(within(summary).getByLabelText(/Gotowość umiarkowana, 50 na 100/))
      .toHaveTextContent('2 serie mniej')
    expect(summary).not.toHaveTextContent('50/100')
    expect(within(summary).getByRole('button', { name: 'Zobacz ćwiczenia w planie' }))
      .toHaveTextContent('Zobacz ćwiczenia')
    expect(summary).toHaveTextContent('4 ćwiczenia')
    expect(within(summary).queryByRole('button', { name: 'Edytuj' })).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { hidden: true })
    expect(within(dialog).getByText('72,5 kg')).toBeInTheDocument()
    const [start, edit] = within(dialog).getAllByRole('button', { hidden: true }).slice(-2)
    expect(start).toHaveTextContent('Rozpocznij')
    expect(edit).toHaveTextContent('Edytuj')
    expect(start.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(within(summary).getByRole('button', { name: 'Rozpocznij Upper A' }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect([...onStart.mock.calls[0][0]]).toEqual([
      ['global:bench', { sets: 4, weight: 72.5, reps: 8 }],
      ['global:row', { sets: 4, weight: 65, reps: 8 }],
      ['global:ohp', { sets: 2, weight: 40, reps: 10 }],
      ['global:pulldown', { sets: 2, weight: 50, reps: 12 }],
    ])

    fireEvent.click(edit)
    expect(onEdit).toHaveBeenCalledTimes(1)
  })
})
