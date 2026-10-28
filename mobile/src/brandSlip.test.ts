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

test('the loop starts on the finished mark and ends with the single slip', () => {
  const { once, loop } = BRAND_MARK_SLIP
  // A load shorter than the first rest shows the plain mark: slid, cut in red.
  assert.equal(loop.offsets[0], 0)
  assert.equal(loop.cover.opacity[0], 0)
  assert.equal(loop.red.opacity[0], 1)
  assert.equal(loop.offsets[loop.offsets.length - 1], 0)
  const last = loop.times.length - 1
  assert.equal(loop.times[last] - loop.times[last - 1], once.times[once.times.length - 1] - once.times[once.times.length - 2])
  assert.deepEqual(loop.ease[loop.ease.length - 1], once.ease[once.ease.length - 1])
  assert.equal(loop.offsets[last - 1], once.offsets[once.offsets.length - 2])
  assert.equal(once.offsets[once.offsets.length - 1], 0)
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
