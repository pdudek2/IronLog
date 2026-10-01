import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { readReadiness, saveReadiness } from './firebase'
import { ReadinessController, type ReadinessState } from './readiness'

const Context = createContext<{ controller: ReadinessController; state: ReadinessState } | null>(null)

export function ReadinessRuntimeProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [state, setState] = useState<ReadinessState | null>(null)
  const controller = useMemo(() => new ReadinessController(uid, { read: readReadiness, write: saveReadiness, now: () => new Date() }, setState), [uid])
  useEffect(() => {
    void controller.load()
    const listener = AppState.addEventListener('change', next => { if (next === 'active') controller.refreshDay() })
    const timer = setInterval(() => controller.refreshDay(), 30_000)
    return () => { listener.remove(); clearInterval(timer); controller.dispose() }
  }, [controller])
  return <Context.Provider value={{ controller, state: state ?? controller.state }}>{children}</Context.Provider>
}

export function useReadinessRuntime() { return useContext(Context) }
