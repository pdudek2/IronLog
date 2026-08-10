import { expect, type Page } from '@playwright/test'
import type { TemplateInput } from '../../../src/lib/templateService'

const exercises = [
  ['bench-press', 'Bench Press'],
  ['pull-up', 'Pull-up'],
  ['overhead-press', 'Overhead Press'],
  ['barbell-row', 'Barbell Row'],
  ['biceps-curl', 'Biceps Curl'],
  ['tricep-pushdown', 'Tricep Pushdown'],
] as const

export const LARGE_TEMPLATE_DRAFT = {
  name: 'Upper / Lower 4×',
  days: ['Upper A', 'Lower A', 'Upper B', 'Lower B'].map((name) => ({
    name,
    exercises: exercises.map(([exerciseId, exerciseName]) => ({
      exerciseId,
      exerciseSource: 'global' as const,
      name: exerciseName,
      sets: 4,
      targetReps: 10,
      targetWeight: 50,
    })),
  })),
}

export async function openTemplateDraft(page: Page, draft: TemplateInput): Promise<void> {
  await page.goto('/templates')
  await page.evaluate((templateDraft) => {
    sessionStorage.setItem('ironlog:template-draft', JSON.stringify(templateDraft))

    const currentState = history.state as { idx?: number } | null
    history.pushState({
      ...currentState,
      key: 'template-draft',
      idx: (currentState?.idx ?? 0) + 1,
    }, '', '/templates/new?draft=ai')
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  }, draft)
  await expect(page.getByRole('textbox', { name: 'Nazwa' })).toHaveValue(draft.name)
}

export async function openLargeTemplateDraft(page: Page): Promise<void> {
  await openTemplateDraft(page, LARGE_TEMPLATE_DRAFT)
}
