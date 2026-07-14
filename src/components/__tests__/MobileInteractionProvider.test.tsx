import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import MobileInteractionProvider, { useMobileInteraction } from '../MobileInteractionProvider'

function Probe() {
  const state = useMobileInteraction()
  return (
    <>
      <input aria-label="Ciężar" />
      <output data-testid="state">
        {JSON.stringify(state)}
      </output>
    </>
  )
}

describe('MobileInteractionProvider', () => {
  let viewport: EventTarget & { height: number; offsetTop: number }

  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  })

  afterEach(() => {
    document.documentElement.style.removeProperty('--mobile-viewport-bottom-inset')
    document.documentElement.removeAttribute('data-mobile-input-focused')
  })

  it('publishes focused input and reduced visual viewport geometry', () => {
    render(<MobileInteractionProvider><Probe /></MobileInteractionProvider>)
    fireEvent.focus(screen.getByRole('textbox', { name: 'Ciężar' }))
    viewport.height = 500
    act(() => viewport.dispatchEvent(new Event('resize')))

    expect(screen.getByTestId('state')).toHaveTextContent('"inputFocused":true')
    expect(screen.getByTestId('state')).toHaveTextContent('"viewportBottomInset":344')
    expect(screen.getByTestId('state')).toHaveTextContent('"compactFixedUi":true')
    expect(document.documentElement.style.getPropertyValue('--mobile-viewport-bottom-inset')).toBe('344px')
  })

  it('falls back to window geometry without visualViewport', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    render(<MobileInteractionProvider><Probe /></MobileInteractionProvider>)
    expect(screen.getByTestId('state')).toHaveTextContent('"visualViewportHeight":844')
    expect(screen.getByTestId('state')).toHaveTextContent('"viewportBottomInset":0')
  })
})
