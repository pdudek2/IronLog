import { useEffect } from 'react'
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

interface UseDialogA11yOptions {
  containerRef: RefObject<HTMLElement | null>
  onClose: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
}

export function useDialogA11y({
  containerRef,
  onClose,
  initialFocusRef,
}: UseDialogA11yOptions) {
  useEffect(() => {
    const dialog = containerRef.current
    if (!dialog) return
    const dialogElement: HTMLElement = dialog

    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
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
        onClose()
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
      document.body.style.overflow = previousOverflow
      previousActiveElement?.focus?.()
    }
  }, [containerRef, onClose, initialFocusRef])
}
