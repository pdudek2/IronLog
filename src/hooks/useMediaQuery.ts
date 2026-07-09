import { useCallback, useSyncExternalStore } from 'react'

function getMatch(query: string): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(query).matches
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === 'undefined') return () => {}

    const mediaQueryList = window.matchMedia(query)
    const handleChange = () => onStoreChange()

    mediaQueryList.addEventListener('change', handleChange)

    return () => mediaQueryList.removeEventListener('change', handleChange)
  }, [query])

  const getSnapshot = useCallback(() => getMatch(query), [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
