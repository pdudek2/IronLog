import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ChatMarkdown from '../ChatMarkdown'

describe('ChatMarkdown', () => {
  it('renders ordered and unordered lists while escaping raw HTML', () => {
    render(
      <ChatMarkdown
        content={'- Bench\n- Squat\n\n1. Warm-up\n2. Work set\n\n<script>alert(1)</script>'}
      />,
    )

    const lists = screen.getAllByRole('list')
    expect(lists).toHaveLength(2)
    expect(within(lists[0]).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lists[1]).getAllByRole('listitem')).toHaveLength(2)
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible()
  })
})
