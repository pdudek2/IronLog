import type { TemplateInput } from './templateService'

const TEMPLATE_DRAFT_STORAGE_KEY = 'ironlog:template-draft'

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

export function saveTemplateDraft(input: TemplateInput) {
  if (!canUseSessionStorage()) return

  window.sessionStorage.setItem(TEMPLATE_DRAFT_STORAGE_KEY, JSON.stringify(input))
}

export function readTemplateDraft(): TemplateInput | null {
  if (!canUseSessionStorage()) return null

  const raw = window.sessionStorage.getItem(TEMPLATE_DRAFT_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<TemplateInput>
    if (typeof parsed.name !== 'string' || !Array.isArray(parsed.days)) return null

    return {
      name: parsed.name,
      days: parsed.days.flatMap((day, index) => {
        if (typeof day !== 'object' || day === null || Array.isArray(day)) return []

        const record = day as unknown as Record<string, unknown>
        const exercises = Array.isArray(record.exercises) ? record.exercises : []

        return [{
          name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : `Dzień ${index + 1}`,
          exercises: exercises.flatMap((exercise) => {
            if (typeof exercise !== 'object' || exercise === null || Array.isArray(exercise)) return []
            const item = exercise as Record<string, unknown>

            const exerciseId = typeof item.exerciseId === 'string' ? item.exerciseId : ''
            const name = typeof item.name === 'string' ? item.name : ''
            if (!exerciseId || !name) return []

            return [{
              exerciseId,
              exerciseSource: item.exerciseSource === 'user' ? 'user' : 'global',
              name,
              sets: typeof item.sets === 'number' ? item.sets : Number(item.sets ?? 0),
              targetReps: typeof item.targetReps === 'number' ? item.targetReps : Number(item.targetReps ?? 0),
              targetWeight: typeof item.targetWeight === 'number' ? item.targetWeight : Number(item.targetWeight ?? 0),
            }]
          }),
        }]
      }),
    }
  } catch {
    return null
  }
}

export function clearTemplateDraft() {
  if (!canUseSessionStorage()) return
  window.sessionStorage.removeItem(TEMPLATE_DRAFT_STORAGE_KEY)
}
