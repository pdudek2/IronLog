import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

export interface UnsavedChangesGuard {
  blocked: boolean
  proceeding: boolean
  proceed: () => void
  reset: () => void
  allowNextNavigation: () => void
}

export function useUnsavedChangesGuard(shouldBlock: boolean): UnsavedChangesGuard {
  const allowNextNavigationRef = useRef(false)
  const blocker = useBlocker(() => {
    if (allowNextNavigationRef.current) {
      allowNextNavigationRef.current = false
      return false
    }
    return shouldBlock
  })

  useEffect(() => {
    if (!shouldBlock) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [shouldBlock])

  const proceed = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed()
  }, [blocker])

  const reset = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  const allowNextNavigation = useCallback(() => {
    allowNextNavigationRef.current = true
  }, [])

  return {
    blocked: blocker.state === 'blocked',
    proceeding: blocker.state === 'proceeding',
    proceed,
    reset,
    allowNextNavigation,
  }
}
