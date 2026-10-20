import type { QuerySnapshot } from 'firebase/firestore'

// Offline, getDocs answers from the local cache, so an empty cached answer means "unknown", not "none".
export function confirmedQuery<T extends QuerySnapshot>(snapshot: T): T {
  if (snapshot.empty && snapshot.metadata?.fromCache) {
    throw new Error('No connection. This data is not saved on this device yet.')
  }
  return snapshot
}
