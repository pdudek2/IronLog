import { describe, expect, it, vi } from 'vitest'
import { navigateWithAppTransition } from '../viewTransitions'

const mocks = vi.hoisted(() => ({
  preloadRouteByPath: vi.fn(),
}))

vi.mock('../../router/pageLoaders', () => ({
  preloadRouteByPath: mocks.preloadRouteByPath,
}))

describe('navigateWithAppTransition', () => {
  it.each(['resolve', 'reject'] as const)(
    'navigates immediately once when a delayed preload later %ss',
    async (outcome) => {
      let settlePreload!: () => void
      const preload = new Promise<void>((resolve, reject) => {
        settlePreload = () => outcome === 'resolve' ? resolve() : reject(new Error('chunk failed'))
      })
      mocks.preloadRouteByPath.mockReturnValueOnce(preload)
      const navigate = vi.fn()

      navigateWithAppTransition(navigate, '/templates')

      expect(navigate).toHaveBeenCalledTimes(1)
      expect(navigate).toHaveBeenCalledWith('/templates', undefined)

      settlePreload()
      await Promise.resolve()
      await Promise.resolve()

      expect(navigate).toHaveBeenCalledTimes(1)
    },
  )
})
