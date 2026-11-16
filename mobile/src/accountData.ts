// Which journal entries belong to an account: session, closure, launch and history-edit journals key by uid,
// the plan editor by JSON [uid, targetId]. An exact match, so `abc` never claims `abc_x`.
export function ownsJournalKey(key: string, uid: string): boolean {
  if (key === uid) return true
  if (!key.startsWith('[')) return false
  try {
    const parsed: unknown = JSON.parse(key)
    return Array.isArray(parsed) && parsed[0] === uid
  } catch {
    return false
  }
}

// The sign-in screen shows once that the account was deleted; the flag lives in memory, so a restart clears it.
let deletedNotice = false
export const markAccountDeleted = () => { deletedNotice = true }
export function takeAccountDeletedNotice(): boolean {
  const shown = deletedNotice
  deletedNotice = false
  return shown
}
