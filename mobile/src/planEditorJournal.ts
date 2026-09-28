import type { PlanDraft } from './planEditor'

export interface PlanDraftSlots {
  read(key: string, slot: 0 | 1): Promise<string | null>
  write(key: string, slot: 0 | 1, value: string): Promise<void>
}

export class PlanEditorJournal {
  private readonly queues = new Map<string, Promise<void>>()
  constructor(private readonly storage: PlanDraftSlots) {}
  key(uid: string, targetId: string | null): string { return JSON.stringify([uid, targetId]) }

  load(uid: string, targetId: string | null): Promise<PlanDraft | null> {
    return this.exclusive(this.key(uid, targetId), async () => (await this.read(uid, targetId)).draft)
  }
  save(uid: string, draft: PlanDraft): Promise<void> {
    return this.exclusive(this.key(uid, draft.targetId), async () => {
      const key = this.key(uid, draft.targetId)
      const { generation } = await this.read(uid, draft.targetId)
      await this.storage.write(key, ((generation + 1) % 2) as 0 | 1,
        JSON.stringify({ version: 1, uid, targetId: draft.targetId, generation: generation + 1, draft }))
    })
  }
  clearIfMatches(uid: string, targetId: string | null, draftId: string, revision: number): Promise<boolean> {
    const key = this.key(uid, targetId)
    return this.exclusive(key, async () => {
      const { draft, generation } = await this.read(uid, targetId)
      if (draft?.draftId !== draftId || draft.revision !== revision) return false
      await this.storage.write(key, ((generation + 1) % 2) as 0 | 1,
        JSON.stringify({ version: 1, uid, targetId, generation: generation + 1, draft: null }))
      return true
    })
  }
  private async read(uid: string, targetId: string | null): Promise<{ generation: number; draft: PlanDraft | null }> {
    const key = this.key(uid, targetId)
    const slots = await Promise.all([this.storage.read(key, 0), this.storage.read(key, 1)])
    const records: { generation: number; draft: PlanDraft | null }[] = []
    let corrupt = false
    for (const raw of slots) {
      if (raw === null) continue
      try {
        const value = JSON.parse(raw) as Record<string, unknown>
        if (value.version !== 1 || value.uid !== uid || value.targetId !== targetId
          || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1) throw new Error('Invalid draft record.')
        const draft = value.draft as PlanDraft | null
        if (draft !== null && (!draft || typeof draft.draftId !== 'string' || !Number.isSafeInteger(draft.revision) || draft.targetId !== targetId
          || !Array.isArray(draft.days) || !draft.days.length || !draft.days.every((day) => typeof day.rowId === 'string' && Array.isArray(day.exercises))
          || (draft.units !== 'kg' && draft.units !== 'lbs'))) throw new Error('Invalid draft data.')
        records.push({ generation: Number(value.generation), draft })
      } catch { corrupt = true }
    }
    const latest = records.sort((a, b) => b.generation - a.generation)[0]
    if (!latest && corrupt) throw new Error('The saved plan draft is damaged. Its files were preserved.')
    return latest ?? { generation: 0, draft: null }
  }
  private exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(key) ?? Promise.resolve()
    const result = prior.catch(() => undefined).then(task)
    this.queues.set(key, result.then(() => undefined, () => undefined))
    return result
  }
}
