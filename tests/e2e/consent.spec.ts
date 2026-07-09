import { expect, test } from '@playwright/test'

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    first.x + first.width <= second.x
    || second.x + second.width <= first.x
    || first.y + first.height <= second.y
    || second.y + second.height <= first.y
  )
}

test('analytics consent does not cover the login action', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/login')

  const banner = page.locator('.analytics-consent-banner > section')
  const loginButton = page.getByRole('button', { name: 'Zaloguj się' })

  await expect(banner).toBeVisible()
  await expect(loginButton).toBeVisible()
  await loginButton.scrollIntoViewIfNeeded()

  const bannerBox = await banner.boundingBox()
  const buttonBox = await loginButton.boundingBox()

  expect(bannerBox).not.toBeNull()
  expect(buttonBox).not.toBeNull()
  expect(boxesOverlap(bannerBox!, buttonBox!)).toBe(false)
  const verticalGap = Math.max(
    bannerBox!.y - (buttonBox!.y + buttonBox!.height),
    buttonBox!.y - (bannerBox!.y + bannerBox!.height),
  )
  expect(verticalGap).toBeGreaterThanOrEqual(16)
})
