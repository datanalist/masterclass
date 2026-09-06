import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BANNER_MAX_TICKS, nextBannerStatus } from './banner.js'

test('banner stays hidden without payment=pending', () => {
  assert.equal(
    nextBannerStatus({ paymentQuery: null, baselineBalance: 50, currentBalance: 50, ticks: 0 }),
    'hidden',
  )
})

test('banner is pending then credited when balance grows', () => {
  assert.equal(
    nextBannerStatus({ paymentQuery: 'pending', baselineBalance: 50, currentBalance: 50, ticks: 1 }),
    'pending',
  )
  assert.equal(
    nextBannerStatus({ paymentQuery: 'pending', baselineBalance: 50, currentBalance: 150, ticks: 2 }),
    'credited',
  )
})

test('banner times out after six ticks without credit', () => {
  assert.equal(
    nextBannerStatus({
      paymentQuery: 'pending',
      baselineBalance: 50,
      currentBalance: 50,
      ticks: BANNER_MAX_TICKS,
    }),
    'timeout',
  )
})
