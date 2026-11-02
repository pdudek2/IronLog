import type { Page } from '@playwright/test'

// With exercises in the session, phones reach Add exercise through the options sheet.
export async function openExercisePicker(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Add exercise', exact: true }).first()
  const options = page.getByRole('button', { name: 'More workout options' })
  await button.or(options).first().waitFor({ timeout: 15_000 })
  if (await button.isVisible()) {
    await button.click()
    return
  }
  await options.click()
  await page.getByRole('dialog', { name: 'Workout options' }).getByRole('button', { name: 'Add exercise', exact: true }).click()
}

export async function selectSet(page: Page, setNumber: number): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^Edit set ${setNumber}:`) }).click()
}
