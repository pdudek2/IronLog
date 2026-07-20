import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkoutDetailMobileActions } from '../WorkoutDetailMobileActions'

let observerCallback: IntersectionObserverCallback
let observedAnchor: Element | null
const disconnect = vi.fn()

class ControlledIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback
  }

  disconnect = disconnect

  observe(element: Element) {
    observedAnchor = element
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  unobserve() {}
}

function emitIntersection(isIntersecting: boolean, top: number) {
  if (!observedAnchor) throw new Error('Expected the mobile actions anchor to be observed.')

  const bounds = {
    x: 0,
    y: top,
    top,
    right: 1,
    bottom: top + 1,
    left: 0,
    width: 1,
    height: 1,
    toJSON: () => ({}),
  }
  const entry = {
    boundingClientRect: bounds,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: isIntersecting ? bounds : { ...bounds, width: 0, height: 0 },
    isIntersecting,
    rootBounds: null,
    target: observedAnchor,
    time: 0,
  } satisfies IntersectionObserverEntry

  const callback = observerCallback
  const observer = new ControlledIntersectionObserver(callback)
  act(() => callback([entry], observer))
}

describe('WorkoutDetailMobileActions', () => {
  beforeEach(() => {
    observedAnchor = null
    disconnect.mockClear()
    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts inline and does not become fixed while its anchor is below the viewport', () => {
    render(
      <WorkoutDetailMobileActions>
        <button type="button">Edytuj</button>
      </WorkoutDetailMobileActions>,
    )

    const actions = screen.getByRole('group', { name: 'Akcje treningu' })
    expect(actions).toHaveAttribute('data-placement', 'inline')
    expect(screen.getAllByRole('button', { name: 'Edytuj' })).toHaveLength(1)

    emitIntersection(false, 120)

    expect(actions).toHaveAttribute('data-placement', 'inline')
  })

  it('fixes only after the anchor passes the top and returns inline when it intersects again', () => {
    render(
      <WorkoutDetailMobileActions>
        <button type="button">Edytuj</button>
      </WorkoutDetailMobileActions>,
    )

    const actions = screen.getByRole('group', { name: 'Akcje treningu' })
    const editButton = screen.getByRole('button', { name: 'Edytuj' })
    editButton.focus()

    emitIntersection(false, -1)

    expect(actions).toHaveAttribute('data-placement', 'fixed')
    expect(screen.getByRole('button', { name: 'Edytuj' })).toBe(editButton)
    expect(editButton).toHaveFocus()

    emitIntersection(true, 0)

    expect(actions).toHaveAttribute('data-placement', 'inline')
    expect(screen.getByRole('button', { name: 'Edytuj' })).toBe(editButton)
    expect(editButton).toHaveFocus()
  })

  it('disconnects the anchor observer on unmount', () => {
    const { unmount } = render(
      <WorkoutDetailMobileActions>
        <button type="button">Edytuj</button>
      </WorkoutDetailMobileActions>,
    )

    expect(observedAnchor).not.toBeNull()
    unmount()

    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
