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

    expect(screen.getByRole('heading', { name: 'Ta strona nie istnieje' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Wróć do panelu' })).toHaveAttribute('href', '/dashboard')
    expect(container.querySelector('.surface-panel')).toBeNull()
  })
})
