import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BRAND_MARK_SLIP } from '../../src/shared/brandMark'
import { slipFrames } from './brandSlip'

const linear = () => (t: number) => t
const { times, offsets, cover, red } = BRAND_MARK_SLIP
const end = times[times.length - 1]

test('slip frames hit every keyframe in order', () => {
  const { inputRange, outputRange } = slipFrames(BRAND_MARK_SLIP, linear)
  assert.equal(inputRange.length, outputRange.length)
  assert.equal(inputRange[0], 0)
  assert.equal(inputRange[inputRange.length - 1], 1)
  // The native driver rejects a decreasing input range.
  inputRange.slice(1).forEach((value, index) => assert.ok(value > inputRange[index]))
  times.forEach((ms, index) => assert.equal(outputRange[inputRange.indexOf(ms / end)], offsets[index]))
})

test('the slip starts whole and ends on the finished mark', () => {
  assert.equal(offsets[0], -140)
  assert.equal(offsets[offsets.length - 1], 0)
  assert.equal(cover.opacity[0], 1)
  assert.equal(cover.opacity[cover.opacity.length - 1], 0)
  assert.equal(red.opacity[red.opacity.length - 1], 1)
})

test('the red seam is on exactly while the cover is not opaque', () => {
  const at = (track: { times: readonly number[]; opacity: readonly number[] }, ms: number) => {
    const index = track.times.findIndex((time) => time >= ms)
    if (track.times[index] === ms) return track.opacity[index]
    const share = (ms - track.times[index - 1]) / (track.times[index] - track.times[index - 1])
    return track.opacity[index - 1] + (track.opacity[index] - track.opacity[index - 1]) * share
  }
  for (let ms = 0; ms <= end; ms += 0.5) {
    if (at(cover, ms) === 1) assert.ok(at(red, ms) <= 0.5, `red shows under an opaque cover at ${ms} ms`)
    else if (at(cover, ms) < 0.99) assert.equal(at(red, ms), 1, `red is not fully on at ${ms} ms`)
  }
})
