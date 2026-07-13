import { createElement, useState, type ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from '../../components/ConfirmDialog'
import Input from '../../components/ui/Input'

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
})
