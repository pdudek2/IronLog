import { expect, type Locator, type Page } from '../fixtures'

export type AppReadyRoute =
  | '/login'
  | '/dashboard'
  | '/history'
  | '/progress'
  | '/templates'
  | '/templates/new'
  | '/exercises'
  | '/chat'
  | '/profile'
  | '/workout/new'
  | `/exercises/${'global' | 'user'}/${string}`

function workoutTerminalState(page: Page): Locator {
  return page.getByRole('button', { name: 'Discard and start again' })
    .or(page.getByRole('button', { name: 'Finish', exact: true }).first())
    .or(page.getByRole('button', { name: 'Start a new session' }))
    .or(page.getByRole('button', { name: 'Add exercise', exact: true }).first())
    .first()
}

export async function expectAppReady(
  page: Page,
  route: AppReadyRoute,
  timeout = 15_000,
): Promise<void> {
  await expect(page).toHaveURL(route, { timeout })

  if (route.startsWith('/exercises/')) {
    await expect(page.locator('.hero-editorial-name')).toBeVisible({ timeout })
    await expect(page.getByText('Could not load exercise', { exact: true })).toHaveCount(0)
    return
  }

  switch (route) {
    case '/login':
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout })
      await expect(page.getByLabel('Email')).toBeVisible({ timeout })
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout })
      return
    case '/dashboard':
      await expect(page.getByRole('button', { name: /^(?:Start new workout|Resume workout)$/ }).first()).toBeVisible({ timeout })
      await expect(page.getByText('Could not load the dashboard', { exact: true })).toHaveCount(0)
      return
    case '/history':
      await expect(page.getByRole('heading', { name: 'History' })).toBeVisible({ timeout })
      await expect(page.getByLabel('Search workout history')).toBeVisible({ timeout })
      await expect(page.getByText('Could not load history', { exact: true })).toHaveCount(0)
      return
    case '/progress':
      await expect(page.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false', { timeout })
      await expect(page.getByLabel('Date range')).toBeVisible({ timeout })
      await expect(page.getByText('Could not load data', { exact: true })).toHaveCount(0)
      return
    case '/templates':
      await expect(
        page.getByRole('button', { name: 'New plan' })
          .or(page.getByRole('button', { name: 'Create your first plan' }))
          .first(),
      ).toBeVisible({ timeout })
      await expect(page.getByText('Could not load templates', { exact: true })).toHaveCount(0)
      return
    case '/templates/new':
      await expect(page.getByPlaceholder('E.g. Upper / Lower 4 days')).toBeVisible({ timeout })
      return
    case '/exercises':
      await expect(page.getByLabel('Search exercises')).toBeVisible({ timeout })
      await expect(page.getByTestId('exercises-page')).toHaveAttribute('data-load-state', /^(?:ready|error)$/, { timeout })
      await expect(page.getByTestId('exercises-page')).toHaveAttribute('data-load-state', 'ready')
      return
    case '/chat':
      await expect(page.getByRole('heading', { name: 'Coach' })).toBeVisible({ timeout })
      return
    case '/profile':
      await expect(page.getByPlaceholder('E.g. Alex')).toBeVisible({ timeout })
      await expect(page.getByText('Could not load your profile', { exact: true })).toHaveCount(0)
      return
    case '/workout/new':
      await expect(workoutTerminalState(page)).toBeVisible({ timeout: Math.max(timeout, 25_000) })
  }
}
