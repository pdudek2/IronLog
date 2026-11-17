import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { readStateForKey, startRead, type ReadResult, type ReadState } from './scopedRead'

// `remember` keeps the last result for the next visit (History only); the key holds the uid.
export function useSessionRead<T>(key: string, load: () => Promise<ReadResult<T>>, enabled = true, remember = false) {
  const [result, setResult] = useState<{ key: string; state: ReadState<T> } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useFocusEffect(useCallback(() => {
    if (!enabled) return
    return startRead(load, (state) => setResult({ key, state }), remember ? key : undefined)
  }, [key, load, attempt, enabled, remember]))
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAttempt((n) => n + 1)
    })
    return () => subscription.remove()
  }, [])
  return { state: readStateForKey(key, result, remember ? key : undefined), retry: () => setAttempt((n) => n + 1) }
}
