import { parseSessionDocument, type ActiveWorkout } from './session'
import type { WorkoutSelection } from './workoutLaunch'

export interface ReplacementIdentity { sessionId: string; sessionRevision: string }

export interface LaunchAttempt {
  replaces?: ReplacementIdentity
  candidate: ActiveWorkout
  selection?: WorkoutSelection & { fingerprint: string }
}
export interface LaunchStorage {
  read(uid: string, slot: 0 | 1): Promise<string | null>
  write(uid: string, slot: 0 | 1, value: string): Promise<void>
}

export class LaunchJournal {
  private generations = new Map<string, number>()
  private queues = new Map<string, Promise<void>>()
  constructor(private storage: LaunchStorage) {}

  load(uid: string): Promise<LaunchAttempt | null> { return this.exclusive(uid, () => this.loadUnlocked(uid)) }

  private async loadUnlocked(uid: string): Promise<LaunchAttempt | null> {
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
          if (value.replaces !== undefined) {
            const from = value.replaces as Record<string, unknown>
            if (!from || typeof from.sessionId !== 'string' || !from.sessionId || from.sessionId.includes('/')
              || typeof from.sessionRevision !== 'string' || !from.sessionRevision || from.sessionRevision.includes('/')
              || from.sessionId === candidate.sessionId || !attempt.selection) throw new Error('Invalid replacement identity.')
            attempt.replaces = { sessionId: from.sessionId, sessionRevision: from.sessionRevision }
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

  save(uid: string, attempt: LaunchAttempt | null): Promise<void> { return this.exclusive(uid, () => this.saveUnlocked(uid, attempt)) }

  async clearIfMatches(uid: string, sessionId: string): Promise<boolean> {
    return this.exclusive(uid, async () => {
      const current = await this.loadUnlocked(uid)
      if (current?.candidate.sessionId !== sessionId) return false
      await this.saveUnlocked(uid, null)
      return true
    })
  }

  private async saveUnlocked(uid: string, attempt: LaunchAttempt | null): Promise<void> {
    const generation = (this.generations.get(uid) ?? 0) + 1
    await this.storage.write(uid, (generation % 2) as 0 | 1, JSON.stringify({
      version: 1, uid, generation, kind: attempt ? 'attempt' : 'empty',
      ...(attempt ? { candidate: attempt.candidate, selection: attempt.selection ?? null, ...(attempt.replaces ? { replaces: attempt.replaces } : {}) } : {}),
    }))
    this.generations.set(uid, generation)
  }

  private exclusive<T>(uid: string, task: () => Promise<T>): Promise<T> {
    const pending = this.queues.get(uid) ?? Promise.resolve()
    const next = pending.catch(() => undefined).then(task)
    this.queues.set(uid, next.then(() => undefined, () => undefined))
    return next
  }
}
