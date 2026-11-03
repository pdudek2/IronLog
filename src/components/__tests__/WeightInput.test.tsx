import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WeightInput from '../workout/WeightInput'

function StoredAsNumber() {
  const [weight, setWeight] = useState(0)
  return <WeightInput aria-label="Weight" value={weight === 0 ? '' : String(weight)} onValueChange={(value) => setWeight(Number(value) || 0)} />
}

describe('WeightInput', () => {
  it('keeps a typed weight below 1 when the caller shows 0 as empty', () => {
    render(<StoredAsNumber />)
    const input = screen.getByRole('spinbutton', { name: 'Weight' })
    for (const key of '0.5') fireEvent.change(input, { target: { value: `${(input as HTMLInputElement).value}${key}` } })
    expect(input).toHaveValue('0.5')
  })
})
