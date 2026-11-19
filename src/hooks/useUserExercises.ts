import { useCallback, useEffect, useRef, useState } from 'react'
import type { Exercise } from '../data/exercises'
import { getUserExercises } from '../lib/userExercisesService'
import type { DataState } from '../types/dataState'

interface UserExercisesResource {
  uid: string | null
  state: DataState<Exercise[]>
}

export interface UseUserExercisesResult {
  state: DataState<Exercise[]>
  exercises: Exercise[]
  retry: () => void
  updateExercises: (
    operationUid: string,
    updater: (current: Exercise[]) => Exercise[],
  ) => void
}

// The last list per account, so a screen opened again starts from it instead of inserting it after the read.
const lastLoaded = new Map<string, Exercise[]>()
const initialState = (uid: string | null): DataState<Exercise[]> => {
  const cached = uid ? lastLoaded.get(uid) : undefined
  return cached ? { status: 'success', data: cached } : { status: 'loading' }
}

export function useUserExercises(uid: string | null): UseUserExercisesResult {
  const [resource, setResource] = useState<UserExercisesResource>(() => ({
    uid,
    state: initialState(uid),
  }))
  const mountedRef = useRef(false)
  const requestRef = useRef(0)

  const load = useCallback((targetUid: string) => {
    const requestId = ++requestRef.current

    getUserExercises(targetUid)
      .then((data) => {
        if (!mountedRef.current || requestId !== requestRef.current) return
        lastLoaded.set(targetUid, data)
        setResource({ uid: targetUid, state: { status: 'success', data } })
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || requestId !== requestRef.current) return
        console.error('[userExercises load error]', error)
        setResource({ uid: targetUid, state: { status: 'error', error } })
      })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    if (uid) load(uid)

    return () => {
      mountedRef.current = false
      requestRef.current += 1
    }
  }, [load, uid])

  const state: DataState<Exercise[]> = resource.uid === uid
    ? resource.state
    : initialState(uid)
  const exercises = state.status === 'success' ? state.data : []

  const retry = useCallback(() => {
    if (!uid) return
    setResource({ uid, state: { status: 'loading' } })
    load(uid)
  }, [load, uid])

  const updateExercises = useCallback((
    operationUid: string,
    updater: (current: Exercise[]) => Exercise[],
  ) => {
    setResource((current) => {
      if (current.uid !== operationUid || current.state.status !== 'success') return current
      const data = updater(current.state.data)
      lastLoaded.set(operationUid, data)
      return { uid: current.uid, state: { status: 'success', data } }
    })
  }, [])

  return { state, exercises, retry, updateExercises }
}
