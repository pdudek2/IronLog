import { createContext, useContext, type ReactNode } from 'react'
import { useWorkoutLaunch } from './useWorkoutLaunch'

type LaunchRuntime = ReturnType<typeof useWorkoutLaunch>
const Context = createContext<LaunchRuntime | null>(null)

export function LaunchRuntimeProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const value = useWorkoutLaunch(uid)
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useLaunchRuntime(): LaunchRuntime {
  const value = useContext(Context)
  if (!value) throw new Error('LaunchRuntimeProvider is missing.')
  return value
}

export function useOptionalLaunchRuntime(): LaunchRuntime | null { return useContext(Context) }
