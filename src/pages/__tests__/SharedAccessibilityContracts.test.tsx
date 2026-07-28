import { createElement, useState, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BottomNav from '../../components/BottomNav'
import ConfirmDialog from '../../components/ConfirmDialog'
import MobileInteractionProvider from '../../components/MobileInteractionProvider'
import TopNav from '../../components/TopNav'
import Input from '../../components/ui/Input'
import { useWorkoutStore } from '../../store/workoutStore'

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: new Proxy({}, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string') return undefined
      return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
        delete props.initial
        delete props.animate
        delete props.exit
        delete props.transition
        delete props.whileTap
        return createElement(tag, props, children)
      }
    },
  }),
}))

function DialogHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Usuń plan</button>
      {open && (
        <ConfirmDialog
          title="Usunąć plan?"
          message="Tej operacji nie można cofnąć."
          confirmLabel="Usuń"
          cancelLabel="Anuluj"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}

describe('shared accessibility contracts', () => {
  beforeEach(() => {
    useWorkoutStore.getState().clearWorkout()
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

    const trigger = screen.getByRole('button', { name: 'Usuń plan' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Usunąć plan?' })
    const cancel = screen.getByRole('button', { name: 'Anuluj' })
    const confirm = screen.getByRole('button', { name: /^Usuń$/ })

    expect(dialog).toHaveAccessibleDescription('Tej operacji nie można cofnąć.')
    expect(cancel).toHaveFocus()

    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(cancel).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('keeps a disabled confirm action non-interactive', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        title="Zapis w toku"
        message="Poczekaj na wynik zapisu."
        confirmLabel="Zapisuję..."
        confirmDisabled
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const confirm = screen.getByRole('button', { name: 'Zapisuję...' })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('labels shell workout entry actions when no active work exists', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileInteractionProvider>
          <TopNav />
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    const workoutActions = screen.getAllByRole('button', { name: 'Rozpocznij nowy trening' })
    expect(workoutActions).toHaveLength(2)
    expect(workoutActions[0]).toHaveTextContent('Nowy trening')
  })

  it('labels shell workout entry actions when the workout store contains active work', () => {
    useWorkoutStore.setState({
      active: {
        sessionId: 'active-session',
        startedAt: 1,
        label: 'Push',
        exercises: [],
      },
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileInteractionProvider>
          <TopNav />
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    const workoutActions = screen.getAllByRole('button', { name: 'Wznów trening' })
    expect(workoutActions).toHaveLength(2)
    expect(workoutActions[0]).toHaveTextContent('Wznów trening')
  })

  it('keeps primary mobile navigation available while the page scrolls', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileInteractionProvider>
          <BottomNav />
        </MobileInteractionProvider>
      </MemoryRouter>,
    )

    const nav = screen.getByRole('navigation', { name: 'Nawigacja dolna' })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 })
    fireEvent.scroll(window)

    await waitFor(() => {
      expect(nav).not.toHaveAttribute('aria-hidden', 'true')
      expect(nav).not.toHaveAttribute('inert')
    })
  })
})
