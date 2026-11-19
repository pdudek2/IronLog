import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WeightInput from '../workout/WeightInput'

function StoredAsNumber() {
  const [weight, setWeight] = useState(0)
  return <WeightInput aria-label="Weight" units="kg" value={weight === 0 ? '' : String(weight)} onValueChange={(value) => setWeight(Number(value) || 0)} />
}

describe('WeightInput', () => {
  it('keeps a typed weight below 1 when the caller shows 0 as empty', () => {
    render(<StoredAsNumber />)
    const input = screen.getByRole('spinbutton', { name: 'Weight' })
    for (const key of '0.5') fireEvent.change(input, { target: { value: `${(input as HTMLInputElement).value}${key}` } })
    expect(input).toHaveValue('0.5')
  })

  it('selects the whole value when a focused field is tapped again, so typing replaces it', () => {
    render(<WeightInput aria-label="Weight" units="kg" value="92.5" onValueChange={() => undefined} />)
    const input = screen.getByRole('spinbutton', { name: 'Weight' }) as HTMLInputElement
    input.focus()
    input.setSelectionRange(1, 1)
    fireEvent.pointerDown(input)
    fireEvent.click(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4])

    // A first tap focuses the field; its own focus handling decides the selection.
    input.blur()
    input.setSelectionRange(1, 1)
    fireEvent.pointerDown(input)
    input.focus()
    fireEvent.click(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 1])
  })
})
