import assert from 'node:assert/strict'
import test from 'node:test'
import { ownsJournalKey } from './accountData'

test('journal keys of the account are claimed exactly, never a neighbour whose uid starts the same', () => {
  assert.equal(ownsJournalKey('abc', 'abc'), true)
  assert.equal(ownsJournalKey(JSON.stringify(['abc', null]), 'abc'), true)
  assert.equal(ownsJournalKey(JSON.stringify(['abc', 'plan-1']), 'abc'), true)
  assert.equal(ownsJournalKey('abc_x', 'abc'), false)
  assert.equal(ownsJournalKey(JSON.stringify(['abc_x', null]), 'abc'), false)
  assert.equal(ownsJournalKey('[not json', 'abc'), false)
})
