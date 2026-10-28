import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BRAND_MARK_SLIP } from '../../src/shared/brandMark'
import { slipFrames } from './brandSlip'

const linear = () => (t: number) => t

test('slip frames hit every keyframe in order', () => {
  for (const track of [BRAND_MARK_SLIP.once, BRAND_MARK_SLIP.loop]) {
    const end = track.times[track.times.length - 1]
    const { inputRange, outputRange } = slipFrames(track, linear)
    assert.equal(inputRange.length, outputRange.length)
    assert.equal(inputRange[0], 0)
    assert.equal(inputRange[inputRange.length - 1], 1)
    // The native driver rejects a decreasing input range.
    inputRange.slice(1).forEach((value, index) => assert.ok(value > inputRange[index]))
    track.times.forEach((ms, index) => assert.equal(outputRange[inputRange.indexOf(ms / end)], track.offsets[index]))
  }
})

test('the loop plays the single slip first and comes back whole', () => {
  const { once, loop } = BRAND_MARK_SLIP
  once.times.forEach((ms, index) => {
    assert.equal(loop.times[index], ms)
    assert.equal(loop.offsets[index], once.offsets[index])
  })
  assert.equal(loop.offsets[0], -140)
  assert.equal(loop.offsets[loop.offsets.length - 1], -140)
  assert.equal(once.offsets[once.offsets.length - 1], 0)
  // The cut is hidden while the block is whole and shown once it rests slid.
  assert.equal(loop.cover.opacity[0], 1)
  assert.equal(loop.cover.opacity[loop.cover.opacity.length - 1], 1)
  assert.equal(once.cover.opacity[once.cover.opacity.length - 1], 0)
})

test('the red seam is on exactly while the cover is not opaque', () => {
  for (const { cover, red } of [BRAND_MARK_SLIP.once, BRAND_MARK_SLIP.loop]) {
    const at = (track: typeof cover, ms: number) => {
      const index = track.times.findIndex((time) => time >= ms)
      if (track.times[index] === ms) return track.opacity[index]
      const share = (ms - track.times[index - 1]) / (track.times[index] - track.times[index - 1])
      return track.opacity[index - 1] + (track.opacity[index] - track.opacity[index - 1]) * share
    }
    const end = cover.times[cover.times.length - 1]
    for (let ms = 0; ms <= end; ms += 0.5) {
      if (at(cover, ms) === 1) assert.ok(at(red, ms) <= 0.5, `red shows under an opaque cover at ${ms} ms`)
      else if (at(cover, ms) < 0.99) assert.equal(at(red, ms), 1, `red is not fully on at ${ms} ms`)
    }
  }
})
