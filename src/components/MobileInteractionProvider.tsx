import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react'

export interface MobileInteractionState {
  inputFocused: boolean
  visualViewportHeight: number
  viewportBottomInset: number
  compactFixedUi: boolean
}

function isEditable(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function readState(inputFocused = isEditable(document.activeElement)): MobileInteractionState {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const offsetTop = viewport?.offsetTop ?? 0
  const viewportBottomInset = Math.max(0, window.innerHeight - offsetTop - height)

  return {
    inputFocused,
    visualViewportHeight: height,
    viewportBottomInset,
    compactFixedUi: inputFocused || viewportBottomInset >= 96,
  }
}

const MobileInteractionContext = createContext<MobileInteractionState | null>(null)

// The provider and its hook intentionally form one public context boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function useMobileInteraction(): MobileInteractionState {
  const value = useContext(MobileInteractionContext)
  if (!value) throw new Error('useMobileInteraction must be used inside MobileInteractionProvider')
  return value
}

export default function MobileInteractionProvider({ children }: PropsWithChildren): ReactElement {
  const [state, setState] = useState<MobileInteractionState>(() => readState())

  useEffect(() => {
    const updateGeometry = () => setState((current) => readState(current.inputFocused))
    const onFocusIn = (event: FocusEvent) => setState(readState(isEditable(event.target)))
    const onFocusOut = () => window.setTimeout(() => setState(readState()), 0)
    const viewport = window.visualViewport

    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)
    window.addEventListener('resize', updateGeometry, { passive: true })
    viewport?.addEventListener('resize', updateGeometry, { passive: true })
    viewport?.addEventListener('scroll', updateGeometry, { passive: true })

    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('resize', updateGeometry)
      viewport?.removeEventListener('resize', updateGeometry)
      viewport?.removeEventListener('scroll', updateGeometry)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--mobile-viewport-bottom-inset', `${state.viewportBottomInset}px`)
    root.style.setProperty('--mobile-visual-viewport-height', `${state.visualViewportHeight}px`)
    root.toggleAttribute('data-mobile-input-focused', state.inputFocused)

    return () => {
      root.style.removeProperty('--mobile-viewport-bottom-inset')
      root.style.removeProperty('--mobile-visual-viewport-height')
      root.removeAttribute('data-mobile-input-focused')
    }
  }, [state])

  return (
    <MobileInteractionContext.Provider value={state}>
      {children}
    </MobileInteractionContext.Provider>
  )
}
