import { useSyncExternalStore } from 'react'

// Same contract as the web dashboard store: the header shows the streak Home last computed for this account.
let current = { uid: '', streak: 0 }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function publishStreak(uid: string, streak: number) {
  if (current.uid === uid && current.streak === streak) return
  current = { uid, streak }
  listeners.forEach(listener => listener())
}

export function useStreak(uid: string | undefined) {
  return useSyncExternalStore(subscribe, () => current.uid === uid ? current.streak : 0)
}
