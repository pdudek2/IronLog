import assert from 'node:assert/strict'
import { test } from 'node:test'

import { strengthChartScale, strengthDeltaLabel } from '../../src/shared/progress'
import { progressChartLabelIndices, progressChartTicks, progressChartValue, progressChartX, progressMonotonePath } from './progressChartMath'

test('inspected strength retains fractional kg before converting to lbs', () => {
  assert.equal(progressChartValue(82.5, 'kg', 'weight'), '82.5 kg')
  assert.equal(progressChartValue(82.5, 'lbs', 'weight'), '181.9 lbs')
  assert.deepEqual(progressChartTicks([80, 82.5, 85], 5), [100, 75, 50, 25, 0])
})

test('5, 13, and 53 week labels use their data point coordinates', () => {
  for (const count of [5, 13, 53]) {
    const indices = progressChartLabelIndices(count, 'volume')
    assert.equal(indices[0], 0)
    assert.ok(indices.every((index) => progressChartX(index, count, 240) === index * 240 / (count - 1)))
    assert.ok(indices.every((index, position) => position === 0 || index > indices[position - 1]!))
  }
  assert.deepEqual(progressChartLabelIndices(13, 'volume'), [0, 2, 4, 6, 8, 10, 12])
  assert.deepEqual(progressChartLabelIndices(5, 'volume'), [0, 1, 2, 3, 4])
  assert.deepEqual(progressChartLabelIndices(53, 'volume'), [0, 8, 16, 24, 32, 40, 48])
  assert.match(progressMonotonePath([0, 2, 0], 100, 80, 3), /^M0,80 C/)
})

test('strength axes follow the lift and stay readable when it barely moves', () => {
  assert.deepEqual(strengthChartScale([80, 81.25, 85, 88.75]), { ticks: [80, 85, 90], lo: 80, hi: 90 })
  assert.deepEqual(strengthChartScale([80, 80, 80]), { ticks: [77.5, 80, 82.5], lo: 77.5, hi: 82.5 })
  assert.equal(strengthChartScale([1, 1, 1]).lo, 0)
  assert.deepEqual(strengthChartScale([]), { ticks: [0, 1], lo: 0, hi: 1 })
  assert.match(progressMonotonePath([80, 90], 100, 80, 90, 80), /^M0,80 C.* 100,0$/)
  assert.equal(strengthDeltaLabel(80, 88.75, 'Sep 21', 'kg'), '+8.75 kg since Sep 21')
  assert.equal(strengthDeltaLabel(85, 80, 'Sep 21', 'kg'), '−5 kg since Sep 21')
  assert.equal(strengthDeltaLabel(80, 80, 'Sep 21', 'kg'), 'No change since Sep 21')
})
