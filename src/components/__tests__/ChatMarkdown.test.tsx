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
    expect(lists[0].tagName).toBe('UL')
    expect(lists[1].tagName).toBe('OL')

    const unorderedItems = within(lists[0]).getAllByRole('listitem')
    const orderedItems = within(lists[1]).getAllByRole('listitem')

    expect(unorderedItems).toHaveLength(2)
    expect(orderedItems).toHaveLength(2)
    expect(unorderedItems.map((item) => item.tagName)).toEqual(['LI', 'LI'])
    expect(orderedItems.map((item) => item.tagName)).toEqual(['LI', 'LI'])
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible()
  })
})
