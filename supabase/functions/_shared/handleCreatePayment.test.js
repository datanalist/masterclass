import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleCreatePayment } from './handleCreatePayment.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function deps(overrides = {}) {
  const calls = { yookassa: [], inserts: [] }
  return {
    calls,
    value: {
      getUser: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
      getPackage: async (id) =>
        id === 'starter'
          ? { id: 'starter', title: '100 баллов', points: 100, amount_rub: 490, is_active: true }
          : null,
      createYookassaPayment: async (input) => {
        calls.yookassa.push(input)
        return { id: 'yk_1', confirmationUrl: 'https://yookassa.test/pay' }
      },
      insertPayment: async (row) => {
        calls.inserts.push(row)
      },
      createIdempotenceKey: () => 'idem-1',
      publicAppUrl: 'http://localhost:5173',
      corsHeaders,
      ...overrides,
    },
  }
}

function post(body, headers = { Authorization: 'Bearer jwt-user' }) {
  return new Request('https://example.test/create-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

test('OPTIONS returns CORS preflight', async () => {
  const res = await handleCreatePayment(new Request('https://example.test', { method: 'OPTIONS' }), deps().value)
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
})

test('missing JWT returns 401', async () => {
  const res = await handleCreatePayment(post({ package_id: 'starter' }, {}), deps().value)
  assert.equal(res.status, 401)
})

test('unknown package returns 400 and does not call YooKassa', async () => {
  const d = deps()
  const res = await handleCreatePayment(post({ package_id: 'nope' }), d.value)
  assert.equal(res.status, 400)
  assert.equal(d.calls.yookassa.length, 0)
})

test('inactive or priceless package returns 400', async () => {
  const d = deps({
    getPackage: async () => ({ id: 'starter', title: 'x', points: 100, amount_rub: 0, is_active: true }),
  })
  const res = await handleCreatePayment(post({ package_id: 'starter' }), d.value)
  assert.equal(res.status, 400)
})

test('success creates YooKassa payment then inserts pending row', async () => {
  const d = deps()
  const res = await handleCreatePayment(post({ package_id: 'starter', amount: 1, points: 999 }), d.value)
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.deepEqual(json, { payment_id: 'yk_1', confirmation_url: 'https://yookassa.test/pay' })
  assert.equal(d.calls.yookassa[0].amountValue, '490.00')
  assert.equal(d.calls.yookassa[0].returnUrl, 'http://localhost:5173/profile?payment=pending')
  assert.equal(d.calls.yookassa[0].receipt, undefined)
  assert.equal(d.calls.yookassa[0].metadata.points, '100')
  assert.equal(d.calls.inserts[0].points, 100)
  assert.equal(d.calls.inserts[0].amount_rub, 490)
  assert.equal(d.calls.inserts[0].status, 'pending')
})

test('insert failure after YooKassa does not return confirmation_url', async () => {
  const d = deps({
    insertPayment: async () => {
      throw new Error('db down')
    },
  })
  const res = await handleCreatePayment(post({ package_id: 'starter' }), d.value)
  assert.equal(res.status, 500)
  const json = await res.json()
  assert.equal(json.confirmation_url, undefined)
})

test('missing PUBLIC_APP_URL returns 500', async () => {
  const d = deps({ publicAppUrl: '' })
  const res = await handleCreatePayment(post({ package_id: 'starter' }), d.value)
  assert.equal(res.status, 500)
})
