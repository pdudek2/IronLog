import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearReviewAdminDatabase,
  closeReviewAdminDatabase,
  getReviewAdminDatabase,
} from '../review/support/adminReviewDatabase'
import { parseSaveTemplateRequest, saveTemplateForUser } from '../../api/_lib/templateService'
import { starterPlanInput } from '../../src/shared/planImport'
import { parsePlanText, planToText, resolvedPlan } from '../../src/shared/planText'

const db = getReviewAdminDatabase()

beforeEach(clearReviewAdminDatabase)
afterEach(clearReviewAdminDatabase)
afterAll(closeReviewAdminDatabase)

function multiDayRequest(name = 'Three day plan') {
  const exercises = [
    {
      exerciseId: 'bench-press',
      exerciseSource: 'global' as const,
      name: 'Bench Press',
      sets: 4,
      targetReps: 8,
      targetWeight: 80,
    },
    {
      exerciseId: 'squat',
      exerciseSource: 'global' as const,
      name: 'Squat',
      sets: 3,
      targetReps: 5,
      targetWeight: 120,
    },
  ]
  return {
    name,
    days: [
      { name: 'Upper', exercises: [exercises[0]] },
      { name: 'Lower', exercises: [exercises[1]] },
      { name: 'Rest', exercises: [] },
    ],
  }
}

describe('template persistence', () => {
  it('saves plans made from text, with new catalogue exercises and no weights, and exports them back', async () => {
    const pasted = resolvedPlan(parsePlanText('Glutes\nHip thrust 3x10\nHack squat 3x8 @100\nPrzywodzenie 3x12'))!
    for (const input of [starterPlanInput(), pasted]) {
      const created = await saveTemplateForUser('alice', parseSaveTemplateRequest(input), { db, now: () => 100 })
      const stored = (await db.collection('templates').doc(created.id).get()).data() as { name: string; days: { name: string; exercises: { exerciseId: string; exerciseSource: 'global'; name: string; sets: number; targetReps: number; targetWeight: number }[] }[] }
      expect(stored.days.map((day) => day.exercises)).toEqual(input.days.map((day) => day.exercises))
      expect(resolvedPlan(parsePlanText(planToText(stored)))!.days).toEqual(input.days)
    }
    expect(pasted.days[0]!.exercises.map((exercise) => exercise.exerciseId)).toEqual(['hip-thrust', 'hack-squat', 'hip-adduction'])
  })

  it('creates and updates a multi-day plan that survives emulator reload', async () => {
    const created = await saveTemplateForUser(
      'alice',
      parseSaveTemplateRequest(multiDayRequest()),
      { db, now: () => 100 },
    )
    expect((await db.collection('templates').doc(created.id).get()).data()).toEqual({
      userId: 'alice',
      name: 'Three day plan',
      createdAt: 100,
      updatedAt: 100,
      days: multiDayRequest().days.map((day, index) => ({ id: `d${index}`, ...day })),
    })

    const updatedRequest = multiDayRequest('Updated three day plan')
    updatedRequest.days[2].name = 'Recovery'
    await saveTemplateForUser(
      'alice',
      parseSaveTemplateRequest({ id: created.id, ...updatedRequest }),
      { db, now: () => 200 },
    )

    const reloaded = await db.collection('templates').doc(created.id).get()
    expect(reloaded.data()).toEqual({
      userId: 'alice',
      name: 'Updated three day plan',
      createdAt: 100,
      updatedAt: 200,
      days: updatedRequest.days.map((day, index) => ({ id: `d${index}`, ...day })),
    })

    await expect(saveTemplateForUser(
      'bob',
      parseSaveTemplateRequest({ id: created.id, ...multiDayRequest('Stolen') }),
      { db, now: () => 300 },
    )).rejects.toMatchObject({ status: 403 })
    expect((await db.collection('templates').doc(created.id).get()).data()?.name)
      .toBe('Updated three day plan')
  })
})
