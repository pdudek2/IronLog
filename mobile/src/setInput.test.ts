import assert from 'node:assert/strict'
import test from 'node:test'

import {
  reconcileSetInputSubmissions,
  setInputToStoredValue,
  storedValueToSetInput,
} from './setInput'

test('keeps newer focused text while older local submissions are published', () => {
  const first = setInputToStoredValue('1', 'weight', 'lbs')
  const second = setInputToStoredValue('12', 'weight', 'lbs')

  const olderAcknowledgement = reconcileSetInputSubmissions([first, second], first)
  assert.equal(olderAcknowledgement.acknowledged, true)
  assert.deepEqual(olderAcknowledgement.pending, [second])

  const latestAcknowledgement = reconcileSetInputSubmissions(olderAcknowledgement.pending, second)
  assert.equal(latestAcknowledgement.acknowledged, true)
  assert.deepEqual(latestAcknowledgement.pending, [])
})

test('treats a value outside the local submission sequence as an external adjustment', () => {
  const reconciliation = reconcileSetInputSubmissions(['10', '20'], '22.5')
  assert.equal(reconciliation.acknowledged, false)
  assert.deepEqual(reconciliation.pending, [])
})

test('does not parse a numeric prefix from malformed pounds input', () => {
  assert.equal(setInputToStoredValue('12abc', 'weight', 'lbs'), '12abc')
  assert.equal(storedValueToSetInput('12abc', 'weight', 'lbs'), '12abc')
  const stored = setInputToStoredValue('143,3', 'weight', 'lbs')
  assert.equal(storedValueToSetInput(stored, 'weight', 'lbs'), '143.3')
})

// Rejection must reconcile even when the stored prop remains unchanged.
test('rejected input clears outstanding submissions before blur and permits the next edit', () => {
  const rejected = reconcileSetInputSubmissions(['9', '10'], '8', true)
  assert.deepEqual(rejected, { pending: [], acknowledged: false })
  assert.deepEqual(reconcileSetInputSubmissions(['11'], '11'), { pending: [], acknowledged: true })
})
