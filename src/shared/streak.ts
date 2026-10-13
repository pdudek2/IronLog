export function calcStreak(workouts: { startedAt: number }[]): number {
  if (!workouts.length) return 0

  const days = new Set(workouts.map((workout) => {
    const date = new Date(workout.startedAt)
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  }))

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  const startOffset = days.has(todayKey) ? 0 : 1

  let streak = 0
  for (let i = startOffset; i < 365; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    if (days.has(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`)) streak++
    else break
  }
  return streak
}
