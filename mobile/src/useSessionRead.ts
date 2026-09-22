import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { readStateForKey, startRead, type ReadResult, type ReadState } from './scopedRead'

export function useSessionRead<T>(key: string, load: () => Promise<ReadResult<T>>, enabled = true) {
  const [result, setResult] = useState<{ key: string; state: ReadState<T> } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) return
    return startRead(load, (state) => setResult({ key, state }))
  }, [key, load, attempt, enabled])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAttempt((n) => n + 1)
    })
    return () => subscription.remove()
  }, [])
  return { state: readStateForKey(key, result), retry: () => setAttempt((n) => n + 1) }
}
