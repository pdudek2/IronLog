import { test, expect, type Page } from './fixtures'

// Three workouts the way a sheet from Notion has them: Polish headers, a muscle name to map, one set marked to check.
const HISTORY = `Data;Numer_treningu;Typ;Ćwiczenie;Seria;Powtórzenia;Ciężar_kg;Status
2026-03-02;1;UPPER;Wyciskanie na ławce;1;8;60;Wykonano
2026-03-02;1;UPPER;Wyciskanie na ławce;2;8;60;Wykonano
2026-03-02;1;UPPER;Biceps;1;12;12,5;Wykonano
2026-03-04;2;LOWER;Przysiad;1;5;100;Wykonano
2026-03-04;2;LOWER;Przysiad;2;5;100;Do weryfikacji
2026-03-06;3;UPPER;Wyciskanie na ławce;1;8;62,5;Wykonano
2026-03-06;3;UPPER;Wyciskanie na ławce;2;8;62,5;Nie wykonano
`

async function signUpFresh(page: Page, request: import('@playwright/test').APIRequestContext) {
  const email = `history-${Date.now()}-${Math.round(Math.random() * 1e6)}@ironlog.local`
  const password = process.env.TEST_PASSWORD!
  const signUp = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', { data: { email, password, returnSecureToken: true } })
  expect(signUp.ok()).toBe(true)
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/onboarding', { timeout: 20_000 })
  await page.getByLabel('Name').fill('History E2E')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.waitForURL('/dashboard', { timeout: 20_000 })
}

async function chooseFile(page: Page, name: string, text: string) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') })
}

test.describe('History import', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('imports a Notion sheet, maps the muscle name, shows the workouts without a time, exports them and undoes the import', async ({ page, request }) => {
    test.skip(process.env.E2E_BACKEND !== 'emulator', 'Needs a fresh emulator account')
    await signUpFresh(page, request)

    await page.goto('/history')
    await page.getByRole('button', { name: 'Import history from a file' }).click()
    await expect(page).toHaveURL('/history/import')
    await expect(page.getByText('Choose a CSV file')).toBeVisible({ timeout: 15_000 })
    await chooseFile(page, 'notion.csv', HISTORY)

    const submit = page.getByRole('button', { name: 'Import 3 workouts' })
    await expect(page.getByText('Choose 1 exercise to import')).toBeVisible()
    await expect(submit).toBeDisabled()
    await expect(page.getByText('1 set marked to verify in the file')).toBeVisible()
    await page.getByText(/1 row was not imported/).click()
    await expect(page.getByText(/Line 8 Not done/)).toBeVisible()

    await page.getByRole('button', { name: 'Choose exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose for “Biceps”' })
    await picker.locator('.exercise-picker-result').filter({ hasText: /^Barbell Curl/ }).first().click()
    await expect(picker).not.toBeVisible()
    await expect(page.getByText('3 workouts · 5 sets')).toBeVisible()
    await submit.click()
    await expect(page.getByRole('heading', { name: '3 workouts imported' })).toBeVisible({ timeout: 30_000 })

    await page.getByRole('link', { name: 'View history' }).click()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    const rows = page.locator('.history-workout-meta')
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).not.toContainText('min')
    await expect(page.getByRole('heading', { name: 'Upper' }).first()).toBeVisible()

    await page.goto('/exercises/global/squat')
    await expect(page.locator('.exercise-detail-trend .exercise-detail-panel-head p')).toContainText('Latest 500 kg', { timeout: 15_000 })

    // The export carries the imported sets, and the same file now meets the days already in SHEAR.
    await page.goto('/profile')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export history' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^shear-history-\d{4}-\d{2}-\d{2}\.csv$/)
    const exported = await (await file.createReadStream()).toArray()
    const text = Buffer.concat(exported).toString('utf8')
    expect(text.trim().split('\r\n')).toHaveLength(6)
    expect(text).toContain('2026-03-04,12:00,2,Lower,Squat,1,5,100')

    await page.goto('/history/import')
    await expect(page.getByText('Choose a CSV file')).toBeVisible({ timeout: 15_000 })
    await chooseFile(page, 'shear.csv', text)
    await expect(page.getByText('Already in SHEAR')).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Import 0 workouts' })).toBeDisabled()

    await page.goto('/history/import')
    await chooseFile(page, 'notion.csv', HISTORY)
    await page.getByRole('button', { name: 'Choose exercise' }).click()
    await page.getByRole('dialog', { name: 'Choose for “Biceps”' }).locator('.exercise-picker-result').first().click()
    await page.locator('.history-import-workout input').evaluateAll((boxes) => boxes.forEach((box) => { if (!(box as HTMLInputElement).checked) (box as HTMLInputElement).click() }))
    await page.getByRole('button', { name: 'Import 3 workouts' }).click()
    await expect(page.getByRole('heading', { name: '3 workouts imported' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Undo import' }).click()
    await expect(page.getByRole('heading', { name: 'Import undone' })).toBeVisible({ timeout: 30_000 })
    await page.goto('/history')
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.locator('.history-workout-meta')).toHaveCount(3)
  })
})
