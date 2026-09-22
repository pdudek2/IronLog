import { parseSessionDocument, type ActiveWorkout, type Units } from './session'

const FORMAT_VERSION = 1

export interface PendingSessionWrite {
  expectedRevision: string | null
  requestRevision: string
  snapshot: ActiveWorkout
}

export interface SessionDraft {
  session: ActiveWorkout
  units: Units
  baseRevision: string | null
  pending: PendingSessionWrite | null
}

interface StoredDraftRecord extends SessionDraft {
  formatVersion: typeof FORMAT_VERSION
  kind: 'draft'
  uid: string
  generation: number
}

interface StoredEmptyRecord {
  formatVersion: typeof FORMAT_VERSION
  kind: 'empty'
  uid: string
  generation: number
}

type StoredRecord = StoredDraftRecord | StoredEmptyRecord

export type JournalLoadResult =
  | { status: 'empty' }
  | { status: 'draft'; draft: SessionDraft }
  | { status: 'corrupt' }

export interface JournalSlotStorage {
  read(uid: string, slot: 0 | 1): Promise<string | null>
  write(uid: string, slot: 0 | 1, value: string): Promise<void>
}

function validRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('/')
}

function parseWorkout(uid: string, value: unknown): ActiveWorkout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid draft session.')
  return parseSessionDocument(uid, { userId: uid, ...(value as Record<string, unknown>) })
}

function parseRecord(uid: string, raw: string | null): StoredRecord | null {
  if (raw === null) return null
  const value = JSON.parse(raw) as Record<string, unknown>
  if (value.formatVersion !== FORMAT_VERSION || value.uid !== uid
    || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1) throw new Error('Invalid journal record.')
  const base = {
    formatVersion: FORMAT_VERSION,
    uid,
    generation: Number(value.generation),
  } as const
  if (value.kind === 'empty') return { ...base, kind: 'empty' }
  if (value.kind !== 'draft' || (value.units !== 'kg' && value.units !== 'lbs')) throw new Error('Invalid journal record.')
  const session = parseWorkout(uid, value.session)
  const baseRevision = value.baseRevision === null ? null
    : validRevision(value.baseRevision) ? value.baseRevision : (() => { throw new Error('Invalid base revision.') })()
  let pending: PendingSessionWrite | null = null
  if (value.pending !== null) {
    if (!value.pending || typeof value.pending !== 'object' || Array.isArray(value.pending)) throw new Error('Invalid pending write.')
    const candidate = value.pending as Record<string, unknown>
    if ((candidate.expectedRevision !== null && !validRevision(candidate.expectedRevision)) || !validRevision(candidate.requestRevision)) throw new Error('Invalid pending revision.')
    const snapshot = parseWorkout(uid, candidate.snapshot)
    if (snapshot.sessionId !== session.sessionId) throw new Error('Pending session identity does not match.')
    if (candidate.expectedRevision !== baseRevision || snapshot.sessionRevision !== baseRevision
      || candidate.requestRevision === candidate.expectedRevision) throw new Error('Pending revision lineage is invalid.')
    pending = { expectedRevision: candidate.expectedRevision as string | null, requestRevision: candidate.requestRevision, snapshot }
  }
  if (session.sessionRevision !== baseRevision) throw new Error('Draft revision lineage is invalid.')
  return { ...base, kind: 'draft', session, units: value.units, baseRevision, pending }
}

export class TwoSlotSessionJournal {
  private readonly generations = new Map<string, number>()

  constructor(private readonly storage: JournalSlotStorage) {}

  async load(uid: string): Promise<JournalLoadResult> {
    const raw = await Promise.all([this.storage.read(uid, 0), this.storage.read(uid, 1)])
    const records: StoredRecord[] = []
    let invalid = false
    for (const value of raw) {
      if (value === null) continue
      try {
        const parsed = parseRecord(uid, value)
        if (parsed) records.push(parsed)
      } catch {
        invalid = true
      }
    }
    const newest = records.sort((a, b) => b.generation - a.generation)[0]
    if (!newest) return invalid ? { status: 'corrupt' } : { status: 'empty' }
    this.generations.set(uid, newest.generation)
    return newest.kind === 'empty' ? { status: 'empty' } : {
      status: 'draft',
      draft: {
        session: newest.session,
        units: newest.units,
        baseRevision: newest.baseRevision,
        pending: newest.pending,
      },
    }
  }

  async writeDraft(uid: string, draft: SessionDraft): Promise<void> {
    await this.write(uid, { kind: 'draft', ...draft })
  }

  async clear(uid: string): Promise<void> {
    await this.write(uid, { kind: 'empty' })
  }

  private async write(uid: string, value: Omit<StoredRecord, 'formatVersion' | 'uid' | 'generation'>): Promise<void> {
    const generation = (this.generations.get(uid) ?? 0) + 1
    const record = { formatVersion: FORMAT_VERSION, uid, generation, ...value } as StoredRecord
    await this.storage.write(uid, (generation % 2) as 0 | 1, JSON.stringify(record))
    this.generations.set(uid, generation)
  }
}
