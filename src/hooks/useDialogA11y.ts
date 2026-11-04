import { useEffect, useEffectEvent } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'))
}

// A closing dialog can unmount after the next one opens (exit animations), so the lock is counted, not saved per dialog.
let scrollLocks = 0
let unlockedOverflow = ''

interface UseDialogA11yOptions {
  containerRef: RefObject<HTMLElement | null>
  onClose: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
  /** False while a dialog animates out: it releases keys, scroll and focus before it unmounts. */
  active?: boolean
}

export function useDialogA11y({
  containerRef,
  onClose,
  initialFocusRef,
  active = true,
}: UseDialogA11yOptions) {
  const closeDialog = useEffectEvent(onClose)

  useEffect(() => {
    const dialog = containerRef.current
    if (!dialog || !active) return
    const dialogElement: HTMLElement = dialog

    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    if (scrollLocks === 0) unlockedOverflow = document.body.style.overflow
    scrollLocks += 1
    document.body.style.overflow = 'hidden'

    const focusInitialElement = () => {
      const preferred = initialFocusRef?.current
      const fallback = getFocusableElements(dialogElement)[0] ?? dialogElement
      ;(preferred ?? fallback)?.focus()
    }

    focusInitialElement()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(dialogElement)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialogElement.focus()
        return
      }

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        if (activeElement === first || !dialogElement.contains(activeElement)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      scrollLocks -= 1
      if (scrollLocks === 0) document.body.style.overflow = unlockedOverflow
      const focusLeftBehind = !document.activeElement || document.activeElement === document.body || dialogElement.contains(document.activeElement)
      if (focusLeftBehind) previousActiveElement?.focus?.()
    }
  }, [containerRef, initialFocusRef, active])
}
