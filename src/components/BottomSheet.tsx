import { useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { motion, useDragControls, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { SHEET_DRAG_ELASTIC, SHEET_SPRING, shouldDismissSheet } from '../shared/sheetMotion'

interface BottomSheetProps {
  title: string
  onClose: () => void
  tall?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

export default function BottomSheet({ title, onClose, tall = false, initialFocusRef, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const drag = useDragControls()
  const centred = useMediaQuery('(min-width: 1024px)')
  const hidden = centred ? { opacity: 0, y: 12 } : { y: '100%' }
  const reduced = useReducedMotion()
  const transition = reduced
    ? { duration: 0 }
    : centred ? { duration: 0.18, ease: 'easeOut' as const } : { type: 'spring' as const, ...SHEET_SPRING }

  useDialogA11y({ containerRef: panelRef, onClose, initialFocusRef })

  return createPortal(
    <div className="bottom-sheet-layer">
      <motion.div
        className="bottom-sheet-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        className="bottom-sheet"
        data-tall={tall || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={hidden}
        animate={{ opacity: 1, y: 0 }}
        exit={hidden}
        transition={transition}
        drag={centred ? false : 'y'}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: SHEET_DRAG_ELASTIC }}
        dragMomentum={false}
        onDragEnd={(_, info) => { if (shouldDismissSheet(info.offset.y, info.velocity.y)) onClose() }}
      >
        <div className="bottom-sheet-grab" onPointerDown={(event) => drag.start(event)}>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button type="button" className="bottom-sheet-close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        {children}
      </motion.div>
    </div>,
    document.body,
  )
}
