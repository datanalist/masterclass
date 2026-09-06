import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildReceipt } from './receipt.js'

test('buildReceipt is omitted until 54-FZ follow-up', () => {
  assert.equal(
    buildReceipt({ id: 'starter', title: '100 баллов', amount_rub: 490 }, { email: 'a@b.c' }),
    undefined,
  )
})
