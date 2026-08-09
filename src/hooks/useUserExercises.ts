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

export function useUserExercises(uid: string | null): UseUserExercisesResult {
  const [resource, setResource] = useState<UserExercisesResource>({
    uid,
    state: { status: 'loading' },
  })
  const mountedRef = useRef(false)
  const requestRef = useRef(0)

  const load = useCallback((targetUid: string) => {
    const requestId = ++requestRef.current

    getUserExercises(targetUid)
      .then((data) => {
        if (!mountedRef.current || requestId !== requestRef.current) return
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
    : { status: 'loading' }
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
    setResource((current) => (
      current.uid === operationUid && current.state.status === 'success'
        ? {
            uid: current.uid,
            state: { status: 'success', data: updater(current.state.data) },
          }
        : current
    ))
  }, [])

  return { state, exercises, retry, updateExercises }
}
