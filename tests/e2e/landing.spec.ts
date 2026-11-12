import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'

test.describe('Landing', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shortens the example day by itself, stops when touched, and shortens a pasted plan without saving anything', async ({ page }) => {
    const firestore: string[] = []
    page.on('request', (request) => { if (/firestore\.googleapis\.com|(?:127\.0\.0\.1|localhost):8080\//.test(request.url())) firestore.push(request.url()) })
    await page.clock.install()
    await page.goto('/')
    const hero = page.getByRole('region', { name: 'Upper, today\'s version' })
    const time = (label: string) => hero.getByRole('radio', { name: label })
    await expect(time('Usual ~69 min')).toBeChecked({ timeout: 15_000 })

    await page.clock.runFor(1_700)
    await expect(time('45 min')).toBeChecked()
    await expect(hero.getByRole('group', { name: 'Superset, 3 rounds' })).toBeVisible()
    await expect(hero.getByText('Skipped today')).toBeVisible()
    await expect(hero.getByText('~41 min')).toBeVisible()
    await page.clock.runFor(2_900)
    await expect(time('30 min')).toBeChecked()
    await expect(hero.getByText('~29 min')).toBeVisible()

    await time('20 min').click()
    await page.clock.runFor(10_000)
    await expect(time('20 min')).toBeChecked()

    await page.getByRole('link', { name: 'Try it on your own plan' }).click()
    await page.getByLabel('Your plan', { exact: true }).fill('Push\nWyciskanie na ławce 4x5 90\nFrench press 3x12 30\nWznosy bokiem 3x15 10\nPompki na poręczach 3x8\n\nPull\nMartwy ciąg 3x5 140\nPodciąganie 4x6')
    await page.getByRole('button', { name: 'Show my short day' }).click()
    const pasted = page.getByRole('region', { name: 'Push, today\'s version' })
    await expect(pasted.getByText('French press')).toBeVisible()
    await expect(pasted.getByRole('radio', { name: /min$/ }).first()).toBeVisible()
    await page.getByRole('radio', { name: 'Pull' }).click()
    await expect(page.getByRole('region', { name: 'Pull, today\'s version' }).getByText('Deadlift')).toBeVisible()
    expect(firestore).toEqual([])
  })

  test('shows the short day still when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install()
    await page.goto('/')
    const hero = page.getByRole('region', { name: 'Upper, today\'s version' })
    await expect(hero.getByRole('radio', { name: '45 min' })).toBeChecked({ timeout: 15_000 })
    await page.clock.runFor(10_000)
    await expect(hero.getByRole('radio', { name: '45 min' })).toBeChecked()
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(violations.map((violation) => [violation.id, violation.nodes.flatMap((node) => node.target)])).toEqual([])
  })
})
