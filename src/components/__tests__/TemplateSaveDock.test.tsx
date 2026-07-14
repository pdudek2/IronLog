import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TemplateSaveDock from '../TemplateSaveDock'

describe('TemplateSaveDock', () => {
  it('stays visible but disables submit when the draft is clean', () => {
    render(<TemplateSaveDock dirty={false} saving={false} isEdit={false} />)
    expect(screen.getByTestId('template-save-dock')).toHaveAttribute('data-state', 'clean')
    expect(screen.getByRole('button', { name: 'Zapisano' })).toBeDisabled()
  })

  it('uses create and edit labels for dirty drafts', () => {
    const view = render(<TemplateSaveDock dirty saving={false} isEdit={false} />)
    expect(screen.getByRole('button', { name: 'Zapisz szablon' })).toBeEnabled()
    view.rerender(<TemplateSaveDock dirty saving={false} isEdit />)
    expect(screen.getByRole('button', { name: 'Zapisz zmiany' })).toBeEnabled()
  })

  it('prevents duplicate submit while saving', () => {
    render(<TemplateSaveDock dirty saving isEdit />)
    expect(screen.getByRole('button', { name: 'Zapisuję...' })).toBeDisabled()
  })
})
