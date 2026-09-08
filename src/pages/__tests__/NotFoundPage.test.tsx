import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import NotFoundPage from '../NotFoundPage'

describe('NotFoundPage', () => {
  it('offers a route back to the dashboard without a generic surface panel', () => {
    const { container } = render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(container.querySelector('.surface-panel')).toBeNull()
  })

  it('leaves main-landmark ownership to the authenticated app shell', () => {
    const { container } = render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(container.querySelector('main')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Page not found' }))
      .toHaveAttribute('id', 'not-found-title')
  })
})
