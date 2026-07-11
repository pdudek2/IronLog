import { expect, type Page } from '../fixtures'
import { expectAppReady } from './appReady'

export async function restoreProfileName(page: Page, originalName: string): Promise<void> {
  await page.goto('/profile')
  await expectAppReady(page, '/profile')
  const input = page.getByPlaceholder('np. Jan')
  await input.fill(originalName)
  await page.getByRole('button', { name: /Zapisz zmiany/ }).click()
  await expect(page.getByText('Profil zapisany')).toBeVisible({ timeout: 8_000 })
}

export async function deleteTemplateByName(page: Page, name: string): Promise<void> {
  await page.goto('/templates')
  await expectAppReady(page, '/templates')
  const buttons = page.getByRole('button', { name: `Usuń szablon ${name}` })
  while (await buttons.count()) {
    const count = await buttons.count()
    await buttons.first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
    await expect(buttons).toHaveCount(count - 1, { timeout: 8_000 })
  }
}

export async function deleteUserExerciseByName(page: Page, name: string): Promise<void> {
  await page.goto('/exercises')
  await expectAppReady(page, '/exercises')
  await page.getByLabel('Szukaj ćwiczenia').fill(name)
  const button = page.getByRole('button', { name: `Usuń ćwiczenie ${name}` })
  if (await button.isVisible().catch(() => false)) {
    await button.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń' }).click()
    await expect(button).toHaveCount(0, { timeout: 8_000 })
  }
}

export async function discardActiveSession(page: Page): Promise<void> {
  await page.goto('/workout/new')
  await expectAppReady(page, '/workout/new', 25_000)

  const stale = page.getByRole('button', { name: 'Odrzuć i zacznij od nowa' })
  if (await stale.isVisible().catch(() => false)) {
    await stale.click()
    await expect(page.getByRole('button', { name: 'Anuluj', exact: true }).first()).toBeVisible({ timeout: 15_000 })
  }

  const discard = page.getByRole('button', { name: 'Anuluj', exact: true }).first()
  if (await discard.isVisible().catch(() => false)) {
    await discard.click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Potwierdź akcję' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })
    await dialog.getByRole('button', { name: 'Anuluj trening' }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 })
  }
}
