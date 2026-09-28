export interface EditableTemplate {
  name: string
  days: { name: string; exercises: { exerciseId: string; exerciseSource?: 'global' | 'user'; name: string; sets: number; targetReps: number; targetWeight: number }[] }[]
}

export function templateFingerprint(template: EditableTemplate): string {
  return JSON.stringify({ name: template.name.trim(), days: template.days.map((day, index) => ({
    name: day.name.trim() || `Day ${index + 1}`, exercises: day.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId, exerciseSource: exercise.exerciseSource ?? 'global', name: exercise.name.trim(),
      sets: exercise.sets, targetReps: exercise.targetReps, targetWeight: exercise.targetWeight,
    })),
  })) })
}
