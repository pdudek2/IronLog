import { test, expect } from './fixtures'

test.describe('Privacy and account deletion', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('the privacy policy is public and linked from sign-up', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'Privacy policy', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Delete your account' })).toBeVisible()
    await expect(page.getByText(/SHEAR is run by Patryk Dudek/)).toBeVisible()

    await page.goto('/register')
    await page.getByRole('link', { name: 'Privacy policy' }).click()
    await expect(page).toHaveURL('/privacy')
  })

  test('deleting the account asks for the password, removes the account and clears this browser', async ({ page, request }) => {
    test.skip(process.env.E2E_BACKEND !== 'emulator', 'Needs a fresh emulator account')
    const email = `delete-${Date.now()}-${Math.round(Math.random() * 1e6)}@ironlog.local`
    const password = process.env.TEST_PASSWORD!
    const signUp = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', { data: { email, password, returnSecureToken: true } })
    expect(signUp.ok()).toBe(true)
    const uid = (await signUp.json()).localId as string

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/onboarding', { timeout: 20_000 })
    await page.getByLabel('Name').fill('Delete E2E')
    await page.getByRole('button', { name: 'Save profile' }).click()
    await page.waitForURL('/dashboard', { timeout: 20_000 })
    await page.getByRole('button', { name: 'Use the starter plan' }).click()
    await expect(page.getByRole('button', { name: 'Start Day A' })).toBeVisible({ timeout: 15_000 })
    await page.evaluate((id) => {
      localStorage.setItem(`ironlog:workout-closure:${id}`, '{}')
      localStorage.setItem('ironlog:workout-closure:someone-else', '{}')
    }, uid)

    await page.goto('/profile')
    await expect(page.getByRole('link', { name: /Send feedback/ })).toHaveAttribute('href', /^mailto:shear\.app@proton\.me\?subject=SHEAR%20feedback/)
    await page.getByRole('button', { name: 'Delete account' }).click()
    const sheet = page.getByRole('dialog', { name: 'Delete account' })
    await sheet.getByLabel('Password').fill('wrong-password')
    await sheet.getByRole('button', { name: 'Delete account' }).click()
    await expect(sheet.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL('/profile')

    await sheet.getByLabel('Password').fill(password)
    await sheet.getByRole('button', { name: 'Delete account' }).click()
    await expect(page).toHaveURL(/\/login\?deleted=1$/, { timeout: 30_000 })
    await expect(page.getByText('Your account has been deleted.')).toBeVisible()

    expect(await page.evaluate((id) => [localStorage.getItem(`ironlog:workout-closure:${id}`), localStorage.getItem('ironlog:workout-closure:someone-else')], uid)).toEqual([null, '{}'])
    const lookup = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key', { data: { email, password, returnSecureToken: true } })
    expect(lookup.ok()).toBe(false)
    const templates = await request.get(`http://127.0.0.1:8080/v1/projects/demo-ironlog/databases/(default)/documents/templates`, { headers: { Authorization: 'Bearer owner' } })
    const documents = ((await templates.json()).documents ?? []) as { fields?: { userId?: { stringValue?: string } } }[]
    expect(documents.filter((doc) => doc.fields?.userId?.stringValue === uid)).toEqual([])
  })
})
