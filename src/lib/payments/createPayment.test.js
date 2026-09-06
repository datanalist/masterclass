import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestCreatePayment } from './createPayment.js'

test('requestCreatePayment posts package_id and returns confirmation_url', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(
      JSON.stringify({ payment_id: 'yk_1', confirmation_url: 'https://yookassa.test/pay' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const result = await requestCreatePayment({
    supabaseUrl: 'https://abc.supabase.co',
    accessToken: 'jwt',
    anonKey: 'anon',
    packageId: 'starter',
    fetchImpl,
  })
  assert.deepEqual(result, { ok: true, payment_id: 'yk_1', confirmation_url: 'https://yookassa.test/pay' })
  assert.equal(calls[0].url, 'https://abc.supabase.co/functions/v1/create-payment')
  assert.equal(JSON.parse(calls[0].init.body).package_id, 'starter')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt')
  assert.equal(calls[0].init.headers.apikey, 'anon')
})

test('requestCreatePayment maps HTTP errors and missing URL', async () => {
  const unauthorized = await requestCreatePayment({
    supabaseUrl: 'https://abc.supabase.co',
    accessToken: '',
    anonKey: 'anon',
    packageId: 'starter',
    fetchImpl: async () => new Response('{}', { status: 200 }),
  })
  assert.deepEqual(unauthorized, { ok: false, status: 401 })

  const failed = await requestCreatePayment({
    supabaseUrl: 'https://abc.supabase.co',
    accessToken: 'jwt',
    anonKey: 'anon',
    packageId: 'starter',
    fetchImpl: async () => new Response('{}', { status: 400 }),
  })
  assert.deepEqual(failed, { ok: false, status: 400 })

  const noUrl = await requestCreatePayment({
    supabaseUrl: 'https://abc.supabase.co',
    accessToken: 'jwt',
    anonKey: 'anon',
    packageId: 'starter',
    fetchImpl: async () =>
      new Response(JSON.stringify({ payment_id: 'yk_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  })
  assert.deepEqual(noUrl, { ok: false, status: 500 })
})

test('requestCreatePayment maps fetch network errors', async () => {
  const result = await requestCreatePayment({
    supabaseUrl: 'https://abc.supabase.co',
    accessToken: 'jwt',
    anonKey: 'anon',
    packageId: 'starter',
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  assert.deepEqual(result, { ok: false, status: 0 })
})
