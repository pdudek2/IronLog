import { expect, type Locator, type Page } from '../fixtures'
import { expectAppReady } from './appReady'

export async function restoreProfileName(page: Page, originalName: string): Promise<void> {
  await page.goto('/profile')
  await expectAppReady(page, '/profile')
  const input = page.getByPlaceholder('E.g. Alex')
  await input.fill(originalName)
  await page.getByRole('button', { name: /Save changes/ }).click()
  await expect(page.getByText('Profile saved')).toBeVisible({ timeout: 8_000 })
}

export async function deleteTemplateByName(page: Page, name: string): Promise<void> {
  await page.goto('/templates')
  await expectAppReady(page, '/templates')
  const buttons = page.getByRole('button', { name: `Delete template ${name}` })
  while (await buttons.count()) {
    const count = await buttons.count()
    await buttons.first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(buttons).toHaveCount(count - 1, { timeout: 8_000 })
  }
}

export async function deleteUserExerciseByName(page: Page, name: string): Promise<void> {
  await page.goto('/exercises')
  await expectAppReady(page, '/exercises')
  await page.getByLabel('Search exercises').fill(name)
  const button = page.getByRole('button', { name: `Remove exercise ${name}` })
  if (await button.isVisible().catch(() => false)) {
    await button.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(button).toHaveCount(0, { timeout: 8_000 })
  }
}

export async function openWorkoutDiscardDialog(page: Page): Promise<Locator> {
  const mobileOptions = page.getByRole('button', { name: 'More workout options' })
  if (await mobileOptions.isVisible().catch(() => false)) {
    await mobileOptions.click()
    const menu = page.getByRole('menu', { name: 'Workout options' })
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Discard workout' }).click()
  } else {
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click()
  }

  const dialog = page.getByRole('dialog', { name: 'Discard workout?' })
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  return dialog
}

export async function discardActiveSession(page: Page): Promise<void> {
  if (new URL(page.url()).pathname !== '/workout/new') {
    await page.goto('/workout/new')
  }
  await expectAppReady(page, '/workout/new', 25_000)

  const stale = page.getByRole('button', { name: 'Discard and start again' })
  if (await stale.isVisible().catch(() => false)) {
    await stale.click()
    await expect(page.getByRole('button', { name: 'Finish', exact: true }).first()).toBeVisible({ timeout: 15_000 })
  }

  const activeSession = page.getByRole('button', { name: 'Finish', exact: true }).first()
  if (await activeSession.isVisible().catch(() => false)) {
    const dialog = await openWorkoutDiscardDialog(page)
    await dialog.getByRole('button', { name: 'Discard workout', exact: true }).click()
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 })
  }
}
