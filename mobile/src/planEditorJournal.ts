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
  open(uid: string, targetId: string | null, ownerId: string): Promise<PlanDraft | null> {
    const key = this.key(uid, targetId)
    return this.exclusive(key, async () => {
      const { draft, generation } = await this.read(uid, targetId)
      await this.write(key, uid, targetId, generation + 1, draft, ownerId)
      return draft
    })
  }
  installIfEmpty(uid: string, draft: PlanDraft, ownerId: string, isCurrent: () => boolean = () => true): Promise<boolean> {
    if (draft.targetId !== null || draft.baseline !== null || draft.resolvedId !== null) throw new Error('Import must be a new plan.')
    const key = this.key(uid, null)
    return this.exclusive(key, async () => {
      const current = await this.read(uid, null)
      if (current.corrupt) throw new Error('The saved plan draft needs recovery before import.')
      if (current.draft !== null || !isCurrent()) return false
      await this.write(key, uid, null, current.generation + 1, draft, ownerId)
      return true
    })
  }
  saveIfOwned(uid: string, draft: PlanDraft, ownerId: string, expected: { draftId: string; revision: number } | null): Promise<boolean> {
    const key = this.key(uid, draft.targetId)
    return this.exclusive(key, async () => {
      const current = await this.read(uid, draft.targetId)
      if (current.ownerId !== ownerId || (expected
        ? current.draft?.draftId !== expected.draftId || current.draft.revision > expected.revision || current.draft.revision >= draft.revision
        : current.draft !== null)) return false
      await this.write(key, uid, draft.targetId, current.generation + 1, draft, ownerId)
      return true
    })
  }
  clearIfOwned(uid: string, targetId: string | null, ownerId: string, draftId: string, revision: number): Promise<boolean> {
    const key = this.key(uid, targetId)
    return this.exclusive(key, async () => {
      const { draft, generation, ownerId: currentOwner } = await this.read(uid, targetId)
      if (currentOwner !== ownerId || draft?.draftId !== draftId || draft.revision !== revision) return false
      await this.write(key, uid, targetId, generation + 1, null, ownerId)
      return true
    })
  }
  private write(key: string, uid: string, targetId: string | null, generation: number, draft: PlanDraft | null, ownerId: string): Promise<void> {
    return this.storage.write(key, (generation % 2) as 0 | 1,
      JSON.stringify({ version: 1, uid, targetId, generation, draft, ownerId }))
  }
  private async read(uid: string, targetId: string | null): Promise<{ generation: number; draft: PlanDraft | null; ownerId: string | null; corrupt: boolean }> {
    const key = this.key(uid, targetId)
    const slots = await Promise.all([this.storage.read(key, 0), this.storage.read(key, 1)])
    const records: { generation: number; draft: PlanDraft | null; ownerId: string | null }[] = []
    let corrupt = false
    for (const raw of slots) {
      if (raw === null) continue
      try {
        const value = JSON.parse(raw) as Record<string, unknown>
        if (value.version !== 1 || value.uid !== uid || value.targetId !== targetId
          || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1) throw new Error('Invalid draft record.')
        if (value.ownerId !== undefined && (typeof value.ownerId !== 'string' || !value.ownerId)) throw new Error('Invalid draft owner.')
        const draft = value.draft as PlanDraft | null
        if (draft !== null && (!draft || typeof draft.draftId !== 'string' || !Number.isSafeInteger(draft.revision) || draft.targetId !== targetId
          || !Array.isArray(draft.days) || !draft.days.length || !draft.days.every((day) => typeof day.rowId === 'string' && Array.isArray(day.exercises))
          || (draft.units !== 'kg' && draft.units !== 'lbs')
          || (draft.resolvedId !== undefined && draft.resolvedId !== null && typeof draft.resolvedId !== 'string')
          || (draft.dirty !== undefined && typeof draft.dirty !== 'boolean'))) throw new Error('Invalid draft data.')
        records.push({ generation: Number(value.generation), draft: draft ? { ...draft, resolvedId: draft.resolvedId ?? null, dirty: draft.dirty ?? draft.revision > 0 } : null, ownerId: typeof value.ownerId === 'string' ? value.ownerId : null })
      } catch { corrupt = true }
    }
    const latest = records.sort((a, b) => b.generation - a.generation)[0]
    if (!latest && corrupt) throw new Error('The saved plan draft is damaged. Its files were preserved.')
    return latest ? { ...latest, corrupt } : { generation: 0, draft: null, ownerId: null, corrupt: false }
  }
  private exclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(key) ?? Promise.resolve()
    const result = prior.catch(() => undefined).then(task)
    this.queues.set(key, result.then(() => undefined, () => undefined))
    return result
  }
}
