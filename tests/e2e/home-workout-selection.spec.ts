import { test, expect } from './fixtures'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { deleteTemplateByName, discardActiveSession } from './support/accountCleanup'
import { expectAppReady } from './support/appReady'

const TEMPLATE_NAME = '_E2E Home Workout Choice_'

const draft = {
  name: TEMPLATE_NAME,
  days: [
    {
      name: 'Upper first',
      exercises: [{
        exerciseId: 'bench-press',
        exerciseSource: 'global' as const,
        name: 'Bench Press',
        sets: 3,
        targetReps: 8,
        targetWeight: 60,
      }],
    },
    {
      name: 'Pull second',
      exercises: [{
        exerciseId: 'barbell-row',
        exerciseSource: 'global' as const,
        name: 'Barbell Row',
        sets: 3,
        targetReps: 8,
        targetWeight: 50,
      }],
    },
  ],
}

test('Home changes the selected day without launching and then starts that exact day', async ({ page, cleanup }) => {
  cleanup.add('delete Home workout choice template', () => deleteTemplateByName(page, TEMPLATE_NAME))
  cleanup.add('discard active session', () => discardActiveSession(page))
  await discardActiveSession(page)

  await page.goto('/dashboard')
  await expectAppReady(page, '/dashboard')
  const uid = await page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts')
    if (!auth.currentUser) throw new Error('Missing authenticated user')
    return auth.currentUser.uid
  })
  const adminApp = getApps().find((app) => app.name === 'home-workout-selection')
    ?? initializeApp({ projectId: 'demo-ironlog' }, 'home-workout-selection')
  const now = Date.now()
  await getFirestore(adminApp).collection('templates').add({
    ...draft,
    userId: uid,
    createdAt: now,
    updatedAt: now,
  })
  await page.reload()
  await expectAppReady(page, '/dashboard')
  await expect(page.getByText('Upper first', { exact: true }).first()).toBeVisible({ timeout: 15_000 })

  const changeWorkout = page.getByRole('button', { name: 'Change workout' })
  await changeWorkout.click()
  let picker = page.getByRole('dialog', { name: 'Choose a workout' })
  await picker.getByRole('button', { name: `Select Pull second from plan ${TEMPLATE_NAME}` }).click()
  await picker.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Upper first', { exact: true }).first()).toBeVisible()

  await changeWorkout.click()
  picker = page.getByRole('dialog', { name: 'Choose a workout' })
  await picker.getByRole('button', { name: `Select Pull second from plan ${TEMPLATE_NAME}` }).click()
  await picker.getByRole('button', { name: 'Choose workout' }).click()
  await expect(page.getByText('Pull second', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Start workout' }).click()
  await expect(page).toHaveURL('/workout/new', { timeout: 15_000 })
  await expect(page.getByRole('region', { name: 'Active session: Pull second' })).toBeVisible()
  await expect(page.getByText('Barbell Row', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Bench Press', { exact: true })).toHaveCount(0)
})
