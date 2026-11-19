import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { APIRequestContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'

const SETS: [string, string, number, number, string, string][] = [
  ['bench-press', 'Bench Press', 4, 4, '80', '8'], ['lat-pulldown', 'Lat Pulldown', 3, 3, '65', '10'], ['seated-cable-row', 'Seated Cable Row', 3, 0, '60', '10'],
  ['db-lateral-raise', 'Lateral Raise', 3, 0, '10', '12'], ['db-curl', 'Dumbbell Curl', 3, 0, '14', '10'], ['tricep-pushdown', 'Tricep Pushdown', 3, 0, '30', '12'],
]

// A fresh account in an Upper session: Bench and Pulldown logged, a set every 3.4 min from minute 4, the sheet open at minute 31.
async function openSheet(page: Page, request: APIRequestContext) {
  const email = `cut-${Date.now()}-${Math.round(Math.random() * 1e6)}@ironlog.local`
  const signUp = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key', { data: { email, password: process.env.TEST_PASSWORD!, returnSecureToken: true } })
  expect(signUp.ok()).toBe(true)
  const uid = (await signUp.json()).localId as string
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(process.env.TEST_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/onboarding', { timeout: 20_000 })
  await page.getByLabel('Name').fill('Cut E2E')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.waitForURL('/dashboard', { timeout: 20_000 })

  const app = initializeApp({ projectId: 'demo-ironlog' }, `cut-${uid}`)
  const db = getFirestore(app)
  const startedAt = Date.now() - 31 * 60_000
  let n = 0
  const exercises = SETS.map(([exerciseId, name, total, logged, weight, reps]) => ({
    exerciseId, exerciseSource: 'global', name,
    sets: Array.from({ length: total }, (_, index) => (index < logged
      ? { weight, reps, done: true, completedAt: startedAt + Math.round((4 + 3.4 * n++) * 60_000) }
      : { weight, reps, done: false })),
  }))
  await db.doc(`activeSessions/${uid}`).set({ userId: uid, sessionId: `cut-${uid}`, sessionRevision: 'cut-1', startedAt, templateId: null, label: 'Upper Body', exercises, updatedAt: Date.now() })

  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Return to workout' }).click()
  await page.getByRole('button', { name: 'Short on time?' }).click()
  const sheet = page.getByRole('dialog', { name: 'Short on time' })
  await expect(sheet.getByText(/min of work left · 12 sets/)).toBeVisible()
  return { app, db, uid, sheet }
}

test.describe('Short on time mid-session', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('15 minutes left drops the covered row, runs the circuit and finishes with the cut on record', async ({ page, request }) => {
    test.skip(process.env.E2E_BACKEND !== 'emulator', 'Needs a fresh emulator account')
    const { app, db, uid, sheet } = await openSheet(page, request)
    try {
      await sheet.getByRole('radio', { name: '15 min' }).click()
      await expect(sheet.getByText(/9 of 12 sets left · Same weights/)).toBeVisible()
      await expect(sheet.getByRole('group', { name: 'Circuit, 3 rounds' })).toBeVisible()
      await expect(sheet.getByText('Skipped today')).toBeVisible()
      await sheet.getByRole('button', { name: 'Shorten the rest' }).click()
      await expect(sheet).toBeHidden()

      await expect.poll(async () => (await db.doc(`activeSessions/${uid}`).get()).data()?.compression?.cut?.leftMin, { timeout: 15_000 }).toBe(15)
      const saved = (await db.doc(`activeSessions/${uid}`).get()).data()!
      expect(saved.exercises.map((exercise: { exerciseId: string; group?: string }) => `${exercise.exerciseId}@${exercise.group ?? '-'}`))
        .toEqual(['bench-press@-', 'lat-pulldown@-', 'db-lateral-raise@g1', 'db-curl@g1', 'tricep-pushdown@g1'])

      // The time line now says when it ends, and the circuit is one block done in rounds: raise, curl, pushdown.
      await expect(page.getByRole('button', { name: /left · finish by .*Change/ })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Circuit, 3 rounds' })).toBeVisible()
      const panel = page.getByRole('region', { name: 'Current set' })
      for (const [letter, name] of [['A', 'Lateral Raise'], ['B', 'Dumbbell Curl'], ['C', 'Tricep Pushdown']]) {
        await expect(panel).toContainText(`${letter} · ${name} · round 1 of 3`)
        await page.getByRole('button', { name: 'Log set' }).click()
      }
      await expect(panel).toContainText('then A · Lateral Raise · round 2 of 3')
      await page.getByRole('button', { name: 'Finish', exact: true }).first().click()
      await page.getByRole('button', { name: /Save \d+ sets and finish/ }).click()
      await expect.poll(async () => (await db.doc(`workouts/cut-${uid}`).get()).data()?.compression?.cut?.leftMin, { timeout: 20_000 }).toBe(15)
      const workout = (await db.doc(`workouts/cut-${uid}`).get()).data()!
      expect(workout.exercises.map((exercise: { exerciseId: string }) => exercise.exerciseId)).not.toContain('seated-cable-row')
    } finally {
      await deleteApp(app)
    }
  })

  test('Finish by a clock time cuts to the minutes left and records the clock', async ({ page, request }) => {
    test.skip(process.env.E2E_BACKEND !== 'emulator', 'Needs a fresh emulator account')
    // No sheet motion, so the position is read after layout, not mid-animation.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { app, db, uid, sheet } = await openSheet(page, request)
    try {
      const minus = sheet.getByRole('button', { name: 'Five minutes earlier' })
      const before = await minus.boundingBox()
      await minus.click()
      await minus.click()
      // On a phone the control stays under the finger while the preview grows above it; the desktop dialog is centred.
      if (test.info().project.name === 'mobile') expect((await minus.boundingBox())?.y).toBe(before?.y)
      await expect(sheet.getByText(/ of 12 sets left · Same weights/)).toBeVisible()
      await sheet.getByRole('button', { name: 'Shorten the rest' }).click()
      await expect(sheet).toBeHidden()
      await expect.poll(async () => (await db.doc(`activeSessions/${uid}`).get()).data()?.compression?.cut?.clock, { timeout: 15_000 }).toBe(true)
    } finally {
      await deleteApp(app)
    }
  })
})
