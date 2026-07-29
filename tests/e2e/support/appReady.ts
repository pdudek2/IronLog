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
  return page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
    .or(page.getByRole('button', { name: 'Anuluj', exact: true }).first())
    .or(page.getByRole('button', { name: 'Rozpocznij nową sesję' }))
    .or(page.getByRole('button', { name: 'Dodaj ćwiczenie', exact: true }).first())
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
    await expect(page.getByText('Nie udało się wczytać ćwiczenia', { exact: true })).toHaveCount(0)
    return
  }

  switch (route) {
    case '/login':
      await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible({ timeout })
      await expect(page.getByLabel('Email')).toBeVisible({ timeout })
      await expect(page.getByRole('button', { name: 'Zaloguj się' })).toBeVisible({ timeout })
      return
    case '/dashboard':
      await expect(page.getByRole('button', { name: /^(?:Rozpocznij nowy trening|Wznów trening)$/ }).first()).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się wczytać dashboardu', { exact: true })).toHaveCount(0)
      return
    case '/history':
      await expect(page.getByRole('heading', { name: 'Historia' })).toBeVisible({ timeout })
      await expect(page.getByLabel('Szukaj w historii treningów')).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się pobrać historii', { exact: true })).toHaveCount(0)
      return
    case '/progress':
      await expect(page.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false', { timeout })
      await expect(page.getByLabel('Zakres danych')).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się pobrać danych', { exact: true })).toHaveCount(0)
      return
    case '/templates':
      await expect(page.getByRole('button', { name: 'Nowy plan' })).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się pobrać szablonów', { exact: true })).toHaveCount(0)
      return
    case '/templates/new':
      await expect(page.getByPlaceholder('np. Upper / Lower 4 dni')).toBeVisible({ timeout })
      return
    case '/exercises':
      await expect(page.getByLabel('Szukaj ćwiczenia')).toBeVisible({ timeout })
      await expect(page.getByTestId('exercises-page')).toHaveAttribute('data-load-state', /^(?:ready|error)$/, { timeout })
      await expect(page.getByTestId('exercises-page')).toHaveAttribute('data-load-state', 'ready')
      return
    case '/chat':
      await expect(page.getByLabel('Status AI Coacha')).toBeVisible({ timeout })
      return
    case '/profile':
      await expect(page.getByPlaceholder('np. Jan')).toBeVisible({ timeout })
      await expect(page.getByText('Nie udało się wczytać profilu', { exact: true })).toHaveCount(0)
      return
    case '/workout/new':
      await expect(workoutTerminalState(page)).toBeVisible({ timeout: Math.max(timeout, 25_000) })
  }
}
