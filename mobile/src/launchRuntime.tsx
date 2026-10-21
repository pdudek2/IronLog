import { createContext, useContext, type ReactNode } from 'react'
import { ConfirmDialog } from './dialog'
import { useWorkoutLaunch } from './useWorkoutLaunch'

type LaunchRuntime = ReturnType<typeof useWorkoutLaunch>
const Context = createContext<LaunchRuntime | null>(null)

export function LaunchRuntimeProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const value = useWorkoutLaunch(uid)
  return <Context.Provider value={value}>{children}
    {value.confirmation && <ConfirmDialog title="Replace active session?" message="Your current exercises and sets will be discarded. This cannot be undone." onRequestClose={value.cancelReplacement} buttons={[
      { text: 'Keep current session', style: 'cancel', onPress: value.cancelReplacement },
      { text: 'Start plan', onPress: () => value.confirmation?.confirm() },
    ]} />}
  </Context.Provider>
}

export function useLaunchRuntime(): LaunchRuntime {
  const value = useContext(Context)
  if (!value) throw new Error('LaunchRuntimeProvider is missing.')
  return value
}

export function useOptionalLaunchRuntime(): LaunchRuntime | null { return useContext(Context) }
