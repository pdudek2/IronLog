import { act, fireEvent, render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ActiveWorkoutReturnBar from '../ActiveWorkoutReturnBar'
import { useAuthStore } from '../../store/authStore'
import { useWorkoutStore, type ActiveWorkout } from '../../store/workoutStore'

const activeSession: ActiveWorkout = {
  sessionId: 'session-1',
  startedAt: Date.UTC(2026, 8, 8, 10, 0),
  label: 'Upper body with a deliberately long session label',
  exercises: [{
    exerciseId: 'bench-press',
    exerciseSource: 'global',
    name: 'Bench Press',
    sets: [{ weight: '80', reps: '5', done: true }],
  }],
}

function renderBar(path = '/history') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActiveWorkoutReturnBar />
      <Routes>
        <Route path="/workout/new" element={<output>Workout route</output>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ActiveWorkoutReturnBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 8, 8, 10, 5, 5))
    useAuthStore.setState({ user: { uid: 'user-1' } as User, loading: false })
    useWorkoutStore.getState().clearWorkout()
  })

  afterEach(() => vi.useRealTimers())

  it('returns to the unchanged active session without claiming cloud persistence', () => {
    useWorkoutStore.getState().hydrateFromDoc(activeSession)
    renderBar()

    const region = screen.getByRole('region', { name: 'Active workout' })
    expect(region).toHaveTextContent('Workout in progress')
    expect(region).toHaveTextContent(activeSession.label!)
    expect(region).toHaveTextContent('05:05')
    expect(region).not.toHaveTextContent(/saved|cloud/i)

    fireEvent.click(screen.getByRole('button', { name: 'Return to workout' }))

    expect(screen.getByText('Workout route')).toBeInTheDocument()
    expect(useWorkoutStore.getState().active).toMatchObject(activeSession)
  })

  it('stays hidden without authoritative work and disappears after a terminal update', () => {
    renderBar()
    expect(screen.queryByRole('region', { name: 'Active workout' })).not.toBeInTheDocument()

    act(() => useWorkoutStore.getState().hydrateFromDoc(activeSession))
    expect(screen.getByRole('region', { name: 'Active workout' })).toBeInTheDocument()

    act(() => useWorkoutStore.getState().clearWorkout())
    expect(screen.queryByRole('region', { name: 'Active workout' })).not.toBeInTheDocument()
  })

  it('hides on the active workout route and across the existing account-change reset', () => {
    useWorkoutStore.getState().hydrateFromDoc(activeSession)
    const activeRoute = renderBar('/workout/new')
    expect(screen.queryByRole('region', { name: 'Active workout' })).not.toBeInTheDocument()
    activeRoute.unmount()

    renderBar()
    expect(screen.getByRole('region', { name: 'Active workout' })).toBeInTheDocument()

    act(() => {
      useWorkoutStore.getState().clearWorkout()
      useAuthStore.getState().setUser({ uid: 'user-2' } as User)
    })
    expect(screen.queryByRole('region', { name: 'Active workout' })).not.toBeInTheDocument()

    act(() => useWorkoutStore.getState().hydrateFromDoc({ ...activeSession, sessionId: 'session-2' }))
    expect(screen.getByRole('region', { name: 'Active workout' })).toBeInTheDocument()
  })
})
