const TITLES: Array<[RegExp, string]> = [
  [/^\/login$/, 'Sign in'],
  [/^\/register$/, 'Create account'],
  [/^\/onboarding$/, 'Welcome'],
  [/^\/dashboard$/, 'Home'],
  [/^\/history$/, 'History'],
  [/^\/progress$/, 'Progress'],
  [/^\/templates$/, 'Plans'],
  [/^\/templates\/new$/, 'New plan'],
  [/^\/templates\/[^/]+\/edit$/, 'Edit plan'],
  [/^\/exercises$/, 'Exercises'],
  [/^\/exercises\/[^/]+\/[^/]+$/, 'Exercise'],
  [/^\/chat$/, 'Coach'],
  [/^\/profile$/, 'Profile'],
  [/^\/workout\/new$/, 'Workout'],
  [/^\/workout\/[^/]+$/, 'Saved workout'],
]

// Browser history, tabs and screen readers tell pages apart by their title.
export function routeTitle(pathname: string): string {
  const page = TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'Page not found'
  return `${page} · SHEAR`
}
