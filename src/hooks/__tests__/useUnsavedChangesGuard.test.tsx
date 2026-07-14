import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  useNavigate,
} from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard'

function GuardHarness() {
  const [dirty, setDirty] = useState(false)
  const navigate = useNavigate()
  const guard = useUnsavedChangesGuard(dirty)

  return (
    <>
      <button type="button" onClick={() => setDirty(true)}>Zmień</button>
      <button type="button" onClick={() => navigate('/next')}>Dalej</button>
      <button type="button" onClick={() => { guard.allowNextNavigation(); navigate('/next') }}>
        Zapisz i przejdź
      </button>
      {guard.blocked && (
        <div role="dialog" aria-label="Opuścić?">
          <button type="button" onClick={guard.reset}>Zostań</button>
          <button type="button" onClick={guard.proceed}>Opuść</button>
        </div>
      )}
    </>
  )
}

function renderGuard() {
  const router = createMemoryRouter([
    { path: '/edit', element: <GuardHarness /> },
    { path: '/next', element: <p>Następna strona</p> },
  ], { initialEntries: ['/edit'] })
  render(<RouterProvider router={router} />)
  return router
}

describe('useUnsavedChangesGuard', () => {
  it('blocks dirty navigation and supports reset then proceed', async () => {
    const router = renderGuard()
    fireEvent.click(screen.getByRole('button', { name: 'Zmień' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dalej' }))
    expect(screen.getByRole('dialog', { name: 'Opuścić?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Zostań' }))
    expect(router.state.location.pathname).toBe('/edit')

    fireEvent.click(screen.getByRole('button', { name: 'Dalej' }))
    fireEvent.click(screen.getByRole('button', { name: 'Opuść' }))
    expect(await screen.findByText('Następna strona')).toBeInTheDocument()
  })

  it('allows exactly the navigation authorized after save', async () => {
    const router = renderGuard()
    fireEvent.click(screen.getByRole('button', { name: 'Zmień' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz i przejdź' }))
    expect(await screen.findByText('Następna strona')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/next')
  })

  it('prevents beforeunload while dirty', () => {
    renderGuard()
    fireEvent.click(screen.getByRole('button', { name: 'Zmień' }))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
