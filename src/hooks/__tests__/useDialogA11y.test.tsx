import { useRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDialogA11y } from '../useDialogA11y'

function Dialog({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogA11y({ containerRef: ref, onClose: () => undefined })
  return <div ref={ref} role="dialog" aria-label={name}><button type="button">{name} action</button></div>
}

function Dialogs({ sheet, picker }: { sheet: boolean; picker: boolean }) {
  return <>{sheet && <Dialog name="sheet" />}{picker && <Dialog name="picker" />}</>
}

describe('useDialogA11y', () => {
  it('keeps scrolling locked until the last overlapping dialog closes', () => {
    const view = render(<Dialogs sheet picker={false} />)
    view.rerender(<Dialogs sheet picker />)
    view.rerender(<Dialogs sheet={false} picker />)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement?.textContent).toBe('picker action')

    view.rerender(<Dialogs sheet={false} picker={false} />)
    expect(document.body.style.overflow).toBe('')
  })
})
