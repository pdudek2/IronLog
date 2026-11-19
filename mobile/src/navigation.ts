export function navigationSection(path: string): 'Train' | 'History' | 'Progress' | 'Coach' | undefined {
  if (path === '/dashboard' || path.startsWith('/templates') || path === '/exercises' || path.startsWith('/exercises/')) return 'Train'
  if (path === '/history' || path.startsWith('/workout/') || path.startsWith('/workout-edit/')) return 'History'
  if (path === '/progress') return 'Progress'
  if (path === '/coach') return 'Coach'
}

const TAB_ROUTES = { Train: '/dashboard', History: '/history', Progress: '/progress', Coach: '/coach' } as const
export type NavigationTab = keyof typeof TAB_ROUTES

// Tabs switch instead of stacking, so Android Back from any tab returns to Train and then leaves the app.
export function tabNavigation(path: string, tab: NavigationTab): { kind: 'dismissTo' | 'replace' | 'navigate'; href: string } {
  const href = TAB_ROUTES[tab]
  // `/` can be the stack root after a cold start, where dismissTo has nothing to return to.
  if (tab === 'Train') return { kind: path === '/' ? 'replace' : 'dismissTo', href }
  if (path === TAB_ROUTES.History || path === TAB_ROUTES.Progress || path === TAB_ROUTES.Coach) return { kind: 'replace', href }
  return { kind: 'navigate', href }
}
