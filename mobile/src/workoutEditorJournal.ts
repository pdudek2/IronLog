import { isWorkoutDraft, type WorkoutDraft } from './workoutEditor'
import type { PlanDraftSlots } from './planEditorJournal'
type Entry = { owner: string; draft: WorkoutDraft | null }
type RecordData = { version: 1; uid: string; generation: number; entries: Record<string, Entry> }
// A bounded account journal keeps recovery discoverable after the server deletes a workout.
export class WorkoutEditorJournal {
  private queues = new Map<string, Promise<void>>()
  constructor(private storage: PlanDraftSlots) {}
  private exclusive<T>(uid: string, task: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(uid) ?? Promise.resolve()).catch(() => undefined).then(task)
    this.queues.set(uid, result.then(() => undefined, () => undefined)); return result
  }
  private async read(uid: string): Promise<RecordData> {
    const slots = await Promise.all([this.storage.read(uid, 0), this.storage.read(uid, 1)])
    const records: RecordData[] = []
    for (const raw of slots) {
      if (raw === null) continue
      try {
        if (raw.length > 2_000_000) throw new Error()
        const data = JSON.parse(raw) as RecordData
        if (data.version !== 1 || data.uid !== uid || !Number.isSafeInteger(data.generation) || data.generation < 1
          || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries) || Object.keys(data.entries).length > 20) throw new Error()
        for (const [id, entry] of Object.entries(data.entries)) {
          if (!id || id.includes('/') || !entry || typeof entry.owner !== 'string'
            || (entry.draft !== null && !isWorkoutDraft(entry.draft, id))) throw new Error()
        }
        records.push(data)
      } catch { throw new Error('The saved workout draft is damaged. Its files were preserved.') }
    }
    return records.sort((a, b) => b.generation - a.generation)[0] ?? { version: 1, uid, generation: 0, entries: {} }
  }
  private async write(data: RecordData): Promise<void> {
    data.generation += 1
    await this.storage.write(data.uid, data.generation % 2 as 0 | 1, JSON.stringify(data))
  }
  list(uid: string): Promise<WorkoutDraft[]> { return this.exclusive(uid, async () => Object.values((await this.read(uid)).entries).flatMap(e => e.draft ? [e.draft] : [])) }
  open(uid: string, id: string, owner: string): Promise<WorkoutDraft | null> {
    return this.exclusive(uid, async () => {
      const data = await this.read(uid)
      for (const [key, entry] of Object.entries(data.entries)) if (key !== id && entry.draft === null) delete data.entries[key]
      if (!data.entries[id] && Object.keys(data.entries).length >= 20) throw new Error('Finish or discard another saved workout draft first.')
      const draft = data.entries[id]?.draft ?? null
      data.entries[id] = { owner, draft }; await this.write(data); return draft
    })
  }
  owns(uid: string, id: string, owner: string, draft: WorkoutDraft): Promise<boolean> {
    return this.exclusive(uid, async () => {
      const entry = (await this.read(uid)).entries[id]
      return entry?.owner === owner && entry.draft?.draftId === draft.draftId && entry.draft.revision === draft.revision
    })
  }
  save(uid: string, owner: string, draft: WorkoutDraft, expectedRevision: number | null): Promise<boolean> {
    return this.exclusive(uid, async () => {
      const data = await this.read(uid), entry = data.entries[draft.workoutId]
      if (entry?.owner !== owner || (expectedRevision === null ? entry.draft !== null
        : entry.draft?.draftId !== draft.draftId || entry.draft.revision > expectedRevision || draft.revision <= entry.draft.revision)) return false
      if (!isWorkoutDraft(draft, draft.workoutId)) throw new Error('Invalid workout draft.')
      data.entries[draft.workoutId] = { owner, draft }; await this.write(data); return true
    })
  }
  clear(uid: string, id: string, owner: string, draft: WorkoutDraft): Promise<boolean> {
    return this.exclusive(uid, async () => {
      const data = await this.read(uid), entry = data.entries[id]
      if (entry?.owner !== owner || entry.draft?.draftId !== draft.draftId || entry.draft.revision !== draft.revision) return false
      delete data.entries[id]; await this.write(data); return true
    })
  }
}
