import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom'
import { preloadRouteByPath } from '../router/pageLoaders'

/**
 * Navigate after ensuring the target route's JS chunk is available.
 *
 * We deliberately don't use `document.startViewTransition` here — on mobile
 * Chromium emulation it adds 150–300ms of snapshot/animate overhead for a
 * visual effect the pages already provide via per-section Framer Motion
 * animations. Skipping it makes tab switches feel instant.
 */
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

  if (!targetPath) {
    navigate(to, options)
    return
  }

  void preloadRouteByPath(targetPath).finally(() => {
    navigate(to, options)
  })
}
