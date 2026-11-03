import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LandingDemo from '../LandingDemo'

const ticked = () => screen.getAllByRole('button', { name: /^Unmark set/ }).length
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('LandingDemo', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('logs the remaining sets on its own, rests between them and starts over', () => {
    render(<LandingDemo />)
    expect(ticked()).toBe(1)

    advance(1600)
    expect(ticked()).toBe(2)
    expect(screen.getByText('Set 3 rest')).toBeInTheDocument()

    advance(8000 + 250)
    expect(screen.queryByText('Set 3 rest')).not.toBeInTheDocument()
    advance(1600)
    expect(ticked()).toBe(3)

    advance(8000 + 250)
    advance(2400)
    expect(ticked()).toBe(1)
    expect(screen.getByRole('figure')).toHaveTextContent('82.5 kg')
  })

  it('stops playing once the visitor takes over and charts the heavier set', () => {
    render(<LandingDemo />)
    fireEvent.click(screen.getByRole('button', { name: 'Adjust weight by 2.5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log set 2 for Bench press' }))
    expect(screen.getByRole('figure')).toHaveTextContent('85 kg')

    advance(30_000)
    expect(ticked()).toBe(2)
  })
})
