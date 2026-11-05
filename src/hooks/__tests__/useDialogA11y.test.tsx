import { useRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDialogA11y } from '../useDialogA11y'

function Dialog({ name, active }: { name: string; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogA11y({ containerRef: ref, onClose: () => undefined, active })
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

  it('hands focus back to the opener when a closing sheet passes to a confirmation', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const HandOff = ({ closing }: { closing: boolean }) => (
      <><Dialog name="sheet" active={!closing} />{closing && <Dialog name="confirm" />}</>
    )
    const view = render(<HandOff closing={false} />)
    expect(document.activeElement?.textContent).toBe('sheet action')

    view.rerender(<HandOff closing />)
    expect(document.activeElement?.textContent).toBe('confirm action')

    view.rerender(<Dialog name="sheet" active={false} />)
    expect(document.activeElement).toBe(opener)
    view.unmount()
    expect(document.body.style.overflow).toBe('')
    opener.remove()
  })
})
