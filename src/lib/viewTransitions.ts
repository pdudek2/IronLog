import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom'
import { preloadRouteByPath } from '../router/pageLoaders'

export function navigateWithAppTransition(
  navigate: NavigateFunction,
  to: To,
  options?: NavigateOptions,
) {
  const targetPath =
    typeof to === 'string'
      ? to
      : typeof to.pathname === 'string'
        ? to.pathname
        : null

  if (typeof document === 'undefined') {
    navigate(to, options)
    return
  }

  const viewTransitionDocument = document as Document & {
    startViewTransition?: (update: () => void | Promise<void>) => unknown
  }

  const performNavigation = () => {
    if (typeof viewTransitionDocument.startViewTransition === 'function') {
      viewTransitionDocument.startViewTransition(() => {
        navigate(to, options)
      })
      return
    }

    navigate(to, options)
  }

  if (!targetPath) {
    performNavigation()
    return
  }

  void preloadRouteByPath(targetPath).finally(() => {
    performNavigation()
  })
}
