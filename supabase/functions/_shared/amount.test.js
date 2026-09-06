import assert from 'node:assert/strict'
import { test } from 'node:test'
import { amountsMatch, formatYookassaAmount } from './amount.js'

test('formatYookassaAmount uses two decimal places', () => {
  assert.equal(formatYookassaAmount(490), '490.00')
  assert.equal(formatYookassaAmount(1290), '1290.00')
})

test('amountsMatch compares YooKassa value to whole rubles', () => {
  assert.equal(amountsMatch('490.00', 490), true)
  assert.equal(amountsMatch('490.01', 490), false)
  assert.equal(amountsMatch('1290.00', 490), false)
})
