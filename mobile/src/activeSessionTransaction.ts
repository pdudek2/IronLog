import type { ActiveWorkout } from './session'

export class NativeActiveSessionConflictError extends Error {
  constructor(message = 'The active session changed on the server.') {
    super(message)
    this.name = 'NativeActiveSessionConflictError'
  }
}

export interface ActiveSessionTransactionPort {
  read(): Promise<{ exists: boolean; data: Record<string, unknown> | null }>
  update(fields: Record<string, unknown>): void
}

export async function updateExistingActiveSession(
  transaction: ActiveSessionTransactionPort,
  uid: string,
  session: ActiveWorkout,
  expectedRevision: string | null,
  requestRevision: string,
  updatedAt: number,
): Promise<void> {
  const snapshot = await transaction.read()
  const data = snapshot.data
  if (!snapshot.exists || !data) throw new NativeActiveSessionConflictError('The active session no longer exists.')
  if (data.userId !== uid || data.sessionId !== session.sessionId) {
    throw new NativeActiveSessionConflictError()
  }
  if (data.sessionRevision === requestRevision) return
  if ((data.sessionRevision ?? null) !== expectedRevision) throw new NativeActiveSessionConflictError()
  transaction.update({ exercises: session.exercises, sessionRevision: requestRevision, updatedAt })
}
