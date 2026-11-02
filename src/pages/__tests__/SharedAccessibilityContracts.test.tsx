import { createElement, useRef, useState, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BottomNav from '../../components/BottomNav'
import ConfirmDialog from '../../components/ConfirmDialog'
import ExercisePicker from '../../components/ExercisePicker'
import MobileInteractionProvider, { useMobileInteraction } from '../../components/MobileInteractionProvider'
import TopNav from '../../components/TopNav'
import Input from '../../components/ui/Input'
import { useDialogA11y } from '../../hooks/useDialogA11y'
import { useWorkoutStore } from '../../store/workoutStore'

vi.mock('framer-motion', () => ({
  useDragControls: () => ({ start: () => {} }),
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (target: Record<string, unknown>, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return target[tag] ??= ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.exit
        delete props.transition
        delete props.whileTap
        for (const key of Object.keys(props)) if (/^(drag|onDrag)/.test(key)) delete props[key]
        return createElement(tag, props, children)
      }
    },
  }),
}))

function DialogHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Delete plan</button>
      {open && (
        <ConfirmDialog
          title="Usunąć plan?"
          message="Tej operacji nie można cofnąć."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ExercisePickerHarness() {
  const [open, setOpen] = useState(false)
  useMobileInteraction()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Add exercise</button>
      {open && (
        <ExercisePicker open
          onSelect={() => setOpen(false)}
          onClose={() => setOpen(false)}
          userExercisesState={{ status: 'success', data: [] }}
          onRetryUserExercises={() => undefined}
        />
      )}
    </>
  )
}

function FocusLifecycleProbe({ onClose }: { onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLInputElement>(null)
  useDialogA11y({ containerRef, initialFocusRef, onClose })
  return <div ref={containerRef} role="dialog" aria-label="Focus probe">
    <input ref={initialFocusRef} aria-label="Search probe" />
    <button>Second control</button>
  </div>
}

function WorkoutStartIntentProbe() {
  const location = useLocation()
  const state = location.state as { startNew?: unknown } | null
  return <output data-testid="workout-start-intent">{state?.startNew === true ? 'start' : 'idle'}</output>
}

describe('shared accessibility contracts', () => {
  beforeEach(() => {
    useWorkoutStore.getState().clearWorkout()
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('announces and describes an Input error', () => {
    render(
      <>
        <label htmlFor="api-key">Klucz API</label>
        <Input id="api-key" error="Klucz jest za krótki" />
      </>,
    )

    const input = screen.getByRole('textbox', { name: 'Klucz API' })
    const alert = screen.getByRole('alert')

    expect(alert).toHaveTextContent('Klucz jest za krótki')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Klucz jest za krótki')
  })

  it('names and describes the dialog while preserving focus behavior', async () => {
    render(<DialogHarness />)

    const trigger = screen.getByRole('button', { name: 'Delete plan' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Usunąć plan?' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: /^Delete$/ })

    expect(dialog).toHaveAccessibleDescription('Tej operacji nie można cofnąć.')
    expect(cancel).toHaveFocus()

    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(cancel).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('focuses shared exercise search and restores its opener after Escape', async () => {
    render(<MobileInteractionProvider><ExercisePickerHarness /></MobileInteractionProvider>)
    const opener = screen.getByRole('button', { name: 'Add exercise' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('textbox', { name: 'Search exercises' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it('keeps focus on rerender and calls the latest close callback', () => {
    const firstClose = vi.fn()
    const nextClose = vi.fn()
    const { rerender } = render(<FocusLifecycleProbe onClose={firstClose} />)
    const second = screen.getByRole('button', { name: 'Second control' })
    second.focus()
    rerender(<FocusLifecycleProbe onClose={nextClose} />)
    expect(second).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(nextClose).toHaveBeenCalledOnce()
    expect(firstClose).not.toHaveBeenCalled()
  })

  it('keeps picker interactions stable through provider rerenders', async () => {
    render(<MobileInteractionProvider><ExercisePickerHarness /></MobileInteractionProvider>)
    const opener = screen.getByRole('button', { name: 'Add exercise' })
    opener.focus()
    fireEvent.click(opener)

    const search = screen.getByRole('textbox', { name: 'Search exercises' })
    fireEvent.change(search, { target: { value: 'bench press' } })
    expect(search).toHaveFocus()
    const results = await screen.findAllByRole('button', { name: /Bench Press/i })
    const result = results[0]
    const close = screen.getByRole('button', { name: 'Close' })

    close.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(results.at(-1)).toHaveFocus()
    results.at(-1)!.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.click(result)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it('keeps a disabled confirm action non-interactive', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        title="Saving in progress"
        message="Poczekaj na result zapisu."
        confirmLabel="Saving..."
        confirmDisabled
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const confirm = screen.getByRole('button', { name: 'Saving...' })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('offers no shell workout entry when no active work exists', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileInteractionProvider>
          <TopNav />
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /^(?:Start new workout|New workout|Resume workout)$/ }))
      .not.toBeInTheDocument()
  })

  it.each([
    ['/dashboard', 'Train'],
    ['/templates', 'Train'],
    ['/exercises', 'Train'],
    ['/history', 'History'],
    ['/progress', 'Progress'],
    ['/chat', 'Coach'],
  ])('keeps four ordered mobile actions and one active parent on %s', (route, activeLabel) => {
    render(
      <MemoryRouter initialEntries={[route]}>
        <MobileInteractionProvider>
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    const nav = screen.getByRole('navigation', { name: 'Bottom navigation' })
    const actions = Array.from(nav.querySelectorAll('button'))
    expect(actions.map((action) => action.getAttribute('aria-label'))).toEqual([
      'Train',
      'History',
      'Progress',
      'Coach',
    ])
    expect(actions.filter((action) => action.getAttribute('aria-current') === 'page'))
      .toEqual([screen.getByRole('button', { name: activeLabel })])
  })

  it('resumes from the shell without marking an explicit start', () => {
    useWorkoutStore.setState({
      active: {
        sessionId: 'active-session',
        startedAt: 1,
        exercises: [],
      },
    })

    render(
      <MemoryRouter initialEntries={['/history']}>
        <MobileInteractionProvider>
          <TopNav />
          <WorkoutStartIntentProbe />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Resume workout' }))

    expect(screen.getByTestId('workout-start-intent')).toHaveTextContent('idle')
  })

  it('labels the shell workout entry as resume for an explicitly started empty session', () => {
    useWorkoutStore.setState({
      active: {
        sessionId: 'active-session',
        startedAt: 1,
        exercises: [],
      },
    })

    render(
      <MemoryRouter initialEntries={['/history']}>
        <MobileInteractionProvider>
          <TopNav />
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    const workoutActions = screen.getAllByRole('button', { name: 'Resume workout' })
    expect(workoutActions).toHaveLength(1)
    expect(workoutActions[0]).toHaveTextContent('Resume workout')
  })

  it.each([
    '/workout/completed-session',
    '/workout/new',
  ])('gives workout actions exclusive ownership of the mobile bottom area on %s', (route) => {
    useWorkoutStore.setState({
      active: {
        sessionId: 'active-session',
        startedAt: 1,
        exercises: [],
      },
    })
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <MobileInteractionProvider>
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    const nav = container.querySelector('nav[aria-label="Bottom navigation"]')
    expect(nav).toHaveAttribute('aria-hidden', 'true')
    expect(nav).toHaveAttribute('inert')
  })

  it('keeps mobile navigation on the workout route when no session is open', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/workout/new']}>
        <MobileInteractionProvider>
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    expect(container.querySelector('nav[aria-label="Bottom navigation"]')).not.toHaveAttribute('aria-hidden')
  })

  it('hides mobile navigation on deliberate downward scroll and restores it on upward scroll', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileInteractionProvider>
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    const nav = screen.getByRole('navigation', { name: 'Bottom navigation' })

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 80 })
    fireEvent.scroll(window)
    await waitFor(() => expect(nav).toHaveAttribute('aria-hidden', 'true'))

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 70 })
    fireEvent.scroll(window)
    expect(nav).toHaveAttribute('aria-hidden', 'true')

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 30 })
    fireEvent.scroll(window)
    await waitFor(() => {
      expect(nav).not.toHaveAttribute('aria-hidden', 'true')
      expect(nav).not.toHaveAttribute('inert')
    })
  })
})
