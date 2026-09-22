import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { observeAuth, type AuthUser } from './firebase'
import { useActiveSession } from './useActiveSession'
import { useWorkoutClosure } from './useWorkoutClosure'

type AuthRuntime = { user: AuthUser | null | undefined; startupError: boolean }
type ActiveRuntime = ReturnType<typeof useActiveSession>
type ClosureRuntime = ReturnType<typeof useWorkoutClosure>

const AuthContext = createContext<AuthRuntime | null>(null)
const ActiveContext = createContext<ActiveRuntime | null>(null)
const ClosureContext = createContext<ClosureRuntime | null>(null)

export function AuthRuntimeProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [startupError, setStartupError] = useState(false)
  useEffect(() => observeAuth(setUser, () => setStartupError(true)), [])
  const value = useMemo(() => ({ user, startupError }), [startupError, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function ActiveRuntimeProvider({ uid, children }: { uid: string | null; children: ReactNode }) {
  const active = useActiveSession(uid)
  return <ActiveContext.Provider value={active}>{children}</ActiveContext.Provider>
}

export function ClosureRuntimeProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const closure = useWorkoutClosure(uid)
  return <ClosureContext.Provider value={closure}>{children}</ClosureContext.Provider>
}

export function useAuthRuntime(): AuthRuntime {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthRuntimeProvider is missing.')
  return value
}

export function useActiveRuntime(): ActiveRuntime {
  const value = useContext(ActiveContext)
  if (!value) throw new Error('ActiveRuntimeProvider is missing.')
  return value
}

export function useClosureRuntime(): ClosureRuntime {
  const value = useContext(ClosureContext)
  if (!value) throw new Error('ClosureRuntimeProvider is missing.')
  return value
}

export function useOptionalClosureRuntime(): ClosureRuntime | null {
  return useContext(ClosureContext)
}
