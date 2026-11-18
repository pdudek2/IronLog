import { useSyncExternalStore } from 'react'

export type Rest = { sessionId: string; startedAt: number; totalSec: number }

// One rest per process, shared by the session screen and the running-workout row on other tabs.
let current: Rest | null = null
const listeners = new Set<() => void>()

export function getRest() { return current }
export function setRest(next: Rest | null) {
  if (next === current) return
  current = next
  listeners.forEach((listener) => listener())
}
export function useRest() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, getRest)
}
