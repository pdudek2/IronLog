import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BRAND_MARK_SLIP } from '../../src/shared/brandMark'
import { slipFrames } from './brandSlip'

const linear = () => (t: number) => t
const { times, offsets, loopPause, slipAt } = BRAND_MARK_SLIP
const slipEnd = times[times.length - 1]

test('slip frames start whole, hit every keyframe and end at rest', () => {
  for (const duration of [slipEnd, slipEnd + loopPause]) {
    const { inputRange, outputRange } = slipFrames(duration, linear)
    assert.equal(inputRange.length, outputRange.length)
    assert.equal(inputRange[0], 0)
    assert.equal(inputRange[inputRange.length - 1], 1)
    // The native driver rejects a decreasing input range.
    inputRange.slice(1).forEach((value, index) => assert.ok(value > inputRange[index]))
    times.forEach((ms, index) => assert.equal(outputRange[inputRange.indexOf(ms / duration)], offsets[index]))
    assert.equal(outputRange[outputRange.length - 1], 0)
  }
})

test('the upper part holds over the lower one until the slip starts', () => {
  const { inputRange, outputRange } = slipFrames(slipEnd, linear)
  const held = outputRange.filter((_, index) => inputRange[index] * slipEnd < slipAt)
  assert.ok(held.every((offset) => Math.abs(offset + 140) <= 22))
})
