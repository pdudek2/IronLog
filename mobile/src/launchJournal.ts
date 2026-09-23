import { parseSessionDocument, type ActiveWorkout } from './session'
import type { WorkoutSelection } from './workoutLaunch'

export interface LaunchAttempt {
  candidate: ActiveWorkout
  selection?: WorkoutSelection & { fingerprint: string }
}
export interface LaunchStorage {
  read(uid: string, slot: 0 | 1): Promise<string | null>
  write(uid: string, slot: 0 | 1, value: string): Promise<void>
}

export class LaunchJournal {
  private generations = new Map<string, number>()
  constructor(private storage: LaunchStorage) {}

  async load(uid: string): Promise<LaunchAttempt | null> {
    const slots = await Promise.all([this.storage.read(uid, 0), this.storage.read(uid, 1)])
    const records: { generation: number; attempt: LaunchAttempt | null }[] = []
    let invalid = false
    for (const raw of slots) {
      if (raw === null) continue
      try {
        const value = JSON.parse(raw) as Record<string, unknown>
        if (value.uid !== uid || value.version !== 1 || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1) throw new Error('Invalid launch record.')
        let attempt: LaunchAttempt | null = null
        if (value.kind === 'attempt') {
          if (!value.candidate || typeof value.candidate !== 'object' || Array.isArray(value.candidate)) throw new Error('Invalid candidate.')
          const candidate = parseSessionDocument(uid, { userId: uid, ...value.candidate })
          if (!candidate.sessionRevision) throw new Error('Missing launch revision.')
          if (value.selection === null) attempt = { candidate }
          else {
            const selection = value.selection as Record<string, unknown>
            if (!selection || typeof selection.templateId !== 'string' || !selection.templateId
              || !Number.isSafeInteger(selection.dayIndex) || Number(selection.dayIndex) < 0
              || typeof selection.fingerprint !== 'string' || !selection.fingerprint) throw new Error('Invalid selection.')
            attempt = { candidate, selection: { templateId: selection.templateId, dayIndex: Number(selection.dayIndex), fingerprint: selection.fingerprint } }
          }
        } else if (value.kind !== 'empty') throw new Error('Invalid launch record.')
        records.push({ generation: Number(value.generation), attempt })
      } catch { invalid = true }
    }
    const latest = records.sort((a, b) => b.generation - a.generation)[0]
    if (!latest && invalid) throw new Error('The saved start attempt is damaged. Its files were preserved.')
    this.generations.set(uid, latest?.generation ?? 0)
    return latest?.attempt ?? null
  }

  async save(uid: string, attempt: LaunchAttempt | null): Promise<void> {
    const generation = (this.generations.get(uid) ?? 0) + 1
    await this.storage.write(uid, (generation % 2) as 0 | 1, JSON.stringify({
      version: 1, uid, generation, kind: attempt ? 'attempt' : 'empty',
      ...(attempt ? { candidate: attempt.candidate, selection: attempt.selection ?? null } : {}),
    }))
    this.generations.set(uid, generation)
  }
}
