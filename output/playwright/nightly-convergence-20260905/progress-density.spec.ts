import { expect, test } from '@playwright/test'
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const outputDir = path.dirname(fileURLToPath(import.meta.url))
const appName = 'nightly-progress-browser-density'
const sessionCount = 5_001
const recordCount = 1_001
const references: DocumentReference[] = []
let userId: string | null = null

function adminApp(): App {
  if (process.env.E2E_BACKEND !== 'emulator' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Local emulator only.')
  return getApps().find((candidate) => candidate.name === appName)
    ?? initializeApp({ projectId: 'demo-ironlog' }, appName)
}

async function seedDenseProgressState(): Promise<number> {
  const email = process.env.TEST_EMAIL
  if (!email) throw new Error('TEST_EMAIL is required for the density probe.')
  const uid = (await getAuth(adminApp()).getUserByEmail(email)).uid
  userId = uid
  const database = getFirestore(adminApp())
  const writer = database.bulkWriter()
  const startedAt = performance.now()
  const now = Date.now()

  for (let index = 0; index < sessionCount; index += 1) {
    const reference = database.doc(`exerciseSessions/nightly-density-session-${uid}-${index}`)
    references.push(reference)
    writer.set(reference, {
      userId: uid,
      workoutId: `nightly-density-workout-${Math.floor(index / 5)}`,
      exerciseId: `nightly-density-exercise-${index % 50}`,
      exerciseSource: 'global',
      exerciseName: `Nightly Exercise ${String(index % 50).padStart(2, '0')}`,
      finishedAt: now - (index % 179) * 86_400_000 - (index % 24) * 60_000,
      totalVolume: 500 + index % 1_500,
      totalSets: 3,
      bestSetWeight: 50 + index % 100,
      muscleGroups: [['chest'], ['back'], ['quads'], ['shoulders']][index % 4] ?? ['chest'],
    })
  }

  for (let index = 0; index < recordCount; index += 1) {
    const reference = database.doc(`records/nightly-density-record-${uid}-${index}`)
    references.push(reference)
    writer.set(reference, {
      userId: uid,
      exerciseId: `nightly-density-record-exercise-${index}`,
      exerciseSource: 'global',
      exerciseName: `Nightly Record ${String(index).padStart(4, '0')}`,
      maxWeight: 50 + index % 200,
      maxReps: 5 + index % 20,
      bestVolume: 500 + index,
      totalSessions: 1 + index % 40,
      lastPerformedAt: now - (index % 179) * 86_400_000,
    })
  }

  await writer.close()
  return performance.now() - startedAt
}

test.afterAll(async () => {
  const app = adminApp()
  const database = getFirestore(app)
  const writer = database.bulkWriter()
  for (const reference of references) writer.delete(reference)
  await writer.close()

  await deleteApp(app)
})

test('loads and renders the documented Progress caps end to end', async ({ page }) => {
  test.setTimeout(120_000)
  const seedMs = await seedDenseProgressState()
  const startedAt = performance.now()
  await page.goto('/progress')
  await expect(page.getByTestId('progress-page')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 })
  const readyMs = performance.now() - startedAt

  await expect(page.getByText('Analizy treningowe obejmują najnowsze 5000 wpisów.')).toBeVisible()
  await expect(page.getByText('Lista rekordów jest ograniczona do 1000 wpisów.')).toBeVisible()
  await expect(page.getByText('Zakres danych został ograniczony')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toHaveCount(0)

  const metrics = await page.evaluate(() => ({
    domNodes: document.getElementsByTagName('*').length,
    recordRows: document.querySelectorAll('.progress-record-feature, .progress-record-ledger-row').length,
    scrollHeight: document.documentElement.scrollHeight,
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(metrics.recordRows).toBe(6)
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(userId).not.toBeNull()

  const expandStarted = performance.now()
  await page.getByRole('button', { name: /Pokaż wszystkie/ }).click()
  const expanded = await page.evaluate(() => ({
    domNodes: document.getElementsByTagName('*').length,
    recordRows: document.querySelectorAll('.progress-record-feature, .progress-record-ledger-row').length,
    scrollHeight: document.documentElement.scrollHeight,
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  const expandMs = Math.round(performance.now() - expandStarted)
  expect(expanded.recordRows).toBe(21)
  expect(expanded.domNodes).toBeLessThan(1200)
  expect(expanded.scrollWidth).toBe(expanded.viewportWidth)
  await expect(page.getByRole('button', { name: 'Poprzednia strona rekordów' })).toBeDisabled()
  await page.getByRole('button', { name: 'Następna strona rekordów' }).click()
  await expect(page.getByText('Strona 2 z 50', { exact: true })).toBeVisible()
  await expect(page.locator('.progress-record-ledger-row')).toHaveCount(20)
  const result = { seedMs: Math.round(seedMs), readyMs: Math.round(readyMs), initial: metrics, expandMs, expanded }
  console.log(JSON.stringify(result))
  await fs.writeFile(path.join(outputDir, `density-${process.env.DENSITY_RUN ?? 'before'}.json`), JSON.stringify(result, null, 2))
  await page.getByRole('navigation', { name: 'Strony rekordów' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(outputDir, `progress-density-${process.env.DENSITY_RUN ?? 'before'}.png`) })
})
