export interface ReadinessEntry {
  userId: string
  date: string    // YYYY-MM-DD local
  sleep: number   // 1..5
  mood: number    // 1..5
  soreness: number // 1..5 (5 = bardzo obolały)
  createdAt: number
}

export interface ReadinessScore {
  score: number  // 0..100
  tone: 'low' | 'mid' | 'high'
  color: string
  label: string
}

// Local date, nie UTC — żeby nie przeskakiwało o północy UTC
export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// sleep×0.4 + mood×0.3 + (6−soreness)×0.3, raw ∈ [1,5] → 0..100
export function computeReadinessScore(entry: Pick<ReadinessEntry, 'sleep' | 'mood' | 'soreness'>): ReadinessScore {
  const raw = entry.sleep * 0.4 + entry.mood * 0.3 + (6 - entry.soreness) * 0.3
  const score = Math.round(((raw - 1) / 4) * 100)

  if (score >= 70) return { score, tone: 'high', color: 'var(--accent)', label: 'Ready' }
  if (score >= 40) return { score, tone: 'mid', color: 'var(--danger)', label: 'Moderate' }
  return { score, tone: 'low', color: 'var(--puls-steel)', label: 'Rest' }
}
