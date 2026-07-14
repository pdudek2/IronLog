import { expect, type Page } from '@playwright/test'

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

export async function openLargeTemplateDraft(page: Page): Promise<void> {
  await page.goto('/templates')
  await page.evaluate((draft) => {
    sessionStorage.setItem('ironlog:template-draft', JSON.stringify(draft))

    const currentState = history.state as { idx?: number } | null
    history.pushState({
      ...currentState,
      key: 'template-draft',
      idx: (currentState?.idx ?? 0) + 1,
    }, '', '/templates/new?draft=ai')
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  }, LARGE_TEMPLATE_DRAFT)
  await expect(page.getByRole('textbox', { name: 'Nazwa' })).toHaveValue('Upper / Lower 4×')
}
