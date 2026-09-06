import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideWebhookAction, handleYookassaWebhook } from './handleYookassaWebhook.js'

const apiOk = { id: 'yk-1', status: 'succeeded', paid: true, amount: { value: '490.00' } }
const dbOk = { amount_rub: 490, status: 'pending' }

test('decideWebhookAction requires API payment and DB row', () => {
  assert.deepEqual(decideWebhookAction({ apiPayment: null, dbRow: dbOk }), {
    httpStatus: 500,
    rpcStatus: null,
  })
  assert.deepEqual(decideWebhookAction({ apiPayment: apiOk, dbRow: null }), {
    httpStatus: 500,
    rpcStatus: null,
  })
})

test('decideWebhookAction credits only matching succeeded payments', () => {
  assert.deepEqual(decideWebhookAction({ apiPayment: apiOk, dbRow: dbOk }), {
    httpStatus: 200,
    rpcStatus: 'succeeded',
  })
  assert.deepEqual(
    decideWebhookAction({
      apiPayment: { ...apiOk, amount: { value: '10.00' } },
      dbRow: dbOk,
    }),
    { httpStatus: 200, rpcStatus: 'failed' },
  )
})

test('decideWebhookAction ignores waiting_for_capture and cancels from API status', () => {
  assert.deepEqual(
    decideWebhookAction({
      apiPayment: { ...apiOk, status: 'waiting_for_capture', paid: false },
      dbRow: dbOk,
    }),
    { httpStatus: 200, rpcStatus: null },
  )
  assert.deepEqual(
    decideWebhookAction({
      apiPayment: { ...apiOk, status: 'canceled', paid: false },
      dbRow: dbOk,
    }),
    { httpStatus: 200, rpcStatus: 'canceled' },
  )
})

function post(body) {
  return new Request('https://example.test/yookassa-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deps(overrides = {}) {
  const calls = { finalize: [], fetchYookassa: [] }
  return {
    calls,
    value: {
      fetchYookassaPayment: async (id) => {
        calls.fetchYookassa.push(id)
        return apiOk
      },
      getPaymentRow: async () => dbOk,
      finalizePayment: async (id, status, payload) => {
        calls.finalize.push({ id, status, payload })
        return 150
      },
      ...overrides,
    },
  }
}

test('webhook uses API payload, not notification body, then finalizes', async () => {
  const d = deps()
  const res = await handleYookassaWebhook(
    post({
      event: 'payment.succeeded',
      object: { id: 'yk-1', status: 'succeeded', paid: true, amount: { value: '1.00' } },
    }),
    d.value,
  )
  assert.equal(res.status, 200)
  assert.equal(d.calls.finalize[0].status, 'succeeded')
  assert.equal(d.calls.finalize[0].payload.amount.value, '490.00')
})

test('missing payment row returns 500 so YooKassa retries', async () => {
  const d = deps({ getPaymentRow: async () => null })
  const res = await handleYookassaWebhook(post({ event: 'payment.succeeded', object: { id: 'yk-1' } }), d.value)
  assert.equal(res.status, 500)
  assert.equal(d.calls.finalize.length, 0)
})

test('malformed payment id does not call YooKassa', async () => {
  const d = deps()
  const res = await handleYookassaWebhook(
    post({ event: 'payment.succeeded', object: { id: '../secret?x=1' } }),
    d.value,
  )
  assert.equal(res.status, 400)
  assert.equal(d.calls.fetchYookassa.length, 0)
  assert.equal(d.calls.finalize.length, 0)
})

test('repeat succeeded still returns 200', async () => {
  const d = deps({
    getPaymentRow: async () => ({ amount_rub: 490, status: 'succeeded' }),
    finalizePayment: async (id, status, payload) => {
      d.calls.finalize.push({ id, status, payload })
      return 150
    },
  })
  const res = await handleYookassaWebhook(post({ event: 'payment.succeeded', object: { id: 'yk-1' } }), d.value)
  assert.equal(res.status, 200)
  assert.equal(d.calls.finalize[0].status, 'succeeded')
})
