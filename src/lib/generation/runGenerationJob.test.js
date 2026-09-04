import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GenerateCardImageError } from './generateCardImage.js'
import {
  failOwnGeneration,
  isAlreadyCompletedConflict,
  runGenerationJob,
} from './runGenerationJob.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const GENERATION_ID = '22222222-2222-4222-8222-222222222222'
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333'

test('isAlreadyCompletedConflict only matches completed 409s', () => {
  assert.equal(
    isAlreadyCompletedConflict({
      code: 'generation_conflict',
      message: 'Generation already completed',
    }),
    true,
  )
  assert.equal(
    isAlreadyCompletedConflict({
      code: 'generation_conflict',
      message: 'Generation already failed',
    }),
    false,
  )
})

test('runGenerationJob detects a key subject for marketplace cards and classifies it', async () => {
  const classified = []
  const detectCalls = []
  const order = []
  const client = createJobClient({
    onRpc: (name) => order.push(name),
  })
  const result = await runGenerationJob({
    client,
    userId: USER_ID,
    accessToken: 'token',
    file: new Blob(['x'], { type: 'image/jpeg' }),
    generationType: 'card',
    categoryId: 'accessories',
    objectCount: 1,
    compress: async (file) => file,
    detect: async (input) => {
      detectCalls.push(input)
      order.push('detect')
      return { detectedLabel: 'gold hoop earrings', fallback: false }
    },
    classify: async (_client, input) => {
      classified.push(input)
      order.push('classify')
    },
    generate: async () => ({ ok: true, image: { url: 'https://signed.example/out.png' } }),
  })
  assert.deepEqual(detectCalls, [{ productId: PRODUCT_ID, categoryId: 'accessories' }])
  assert.deepEqual(classified, [
    { productId: PRODUCT_ID, categoryId: 'accessories', detectedLabel: 'gold hoop earrings' },
  ])
  assert.equal(result.detectedLabel, 'gold hoop earrings')
  assert.deepEqual(
    order.filter((step) => step === 'detect' || step === 'classify' || step === 'start_generation'),
    ['detect', 'classify', 'start_generation'],
  )
})

test('runGenerationJob does not classify or charge when detect is unauthorized', async () => {
  const classified = []
  const rpcCalls = []
  const client = createJobClient({
    onRpc: (name) => rpcCalls.push(name),
  })
  await assert.rejects(
    () =>
      runGenerationJob({
        client,
        userId: USER_ID,
        accessToken: 'token',
        file: new Blob(['x'], { type: 'image/jpeg' }),
        generationType: 'card',
        categoryId: 'accessories',
        objectCount: 1,
        compress: async (file) => file,
        detect: async () => {
          throw new GenerateCardImageError('Нужно войти в аккаунт', {
            code: 'unauthorized',
            status: 401,
          })
        },
        classify: async (_client, input) => {
          classified.push(input)
        },
        generate: async () => ({ ok: true, image: { url: 'https://signed.example/out.png' } }),
      }),
    (error) => error.code === 'unauthorized',
  )
  assert.deepEqual(classified, [])
  assert.ok(!rpcCalls.includes('start_generation'))
})

test('runGenerationJob falls back if classify rejects the detected label', async () => {
  const classified = []
  const rpcCalls = []
  const client = createJobClient({
    onRpc: (name) => rpcCalls.push(name),
  })
  const result = await runGenerationJob({
    client,
    userId: USER_ID,
    accessToken: 'token',
    file: new Blob(['x'], { type: 'image/jpeg' }),
    generationType: 'card',
    categoryId: 'accessories',
    objectCount: 1,
    compress: async (file) => file,
    detect: async () => ({ detectedLabel: 'gold hoop earrings', fallback: false }),
    classify: async (_client, input) => {
      classified.push(input)
      if (input.detectedLabel) {
        throw new Error('Detected label is too long')
      }
    },
    generate: async () => ({ ok: true, image: { url: 'https://signed.example/out.png' } }),
  })
  assert.deepEqual(
    classified.map((item) => item.detectedLabel),
    ['gold hoop earrings', null],
  )
  assert.ok(rpcCalls.includes('start_generation'))
  assert.equal(result.detectedLabel, 'gold hoop earrings')
})

test('runGenerationJob continues when key-subject detect falls back', async () => {
  const classified = []
  const client = createJobClient()
  await runGenerationJob({
    client,
    userId: USER_ID,
    accessToken: 'token',
    file: new Blob(['x'], { type: 'image/jpeg' }),
    generationType: 'card',
    categoryId: 'other',
    wishes: 'белый фон',
    objectCount: 1,
    compress: async (file) => file,
    detect: async () => ({ detectedLabel: null, fallback: true, reason: 'upstream' }),
    classify: async (_client, input) => {
      classified.push(input)
    },
    generate: async () => ({ ok: true, image: { url: 'https://signed.example/out.png' } }),
  })
  assert.equal(classified[0].detectedLabel, null)
  assert.equal(classified[0].categoryId, 'other')
})

test('runGenerationJob skips detect for photo jobs', async () => {
  let detectCalled = false
  const classified = []
  const client = createJobClient()
  await runGenerationJob({
    client,
    userId: USER_ID,
    accessToken: 'token',
    file: new Blob(['x'], { type: 'image/jpeg' }),
    generationType: 'photo',
    categoryId: 'other',
    objectCount: 1,
    compress: async (file) => file,
    detect: async () => {
      detectCalled = true
      return { detectedLabel: 'should-not-run', fallback: false }
    },
    classify: async (_client, input) => {
      classified.push(input)
    },
    generate: async () => ({ ok: true, image: { url: 'https://signed.example/out.png' } }),
  })
  assert.equal(detectCalled, false)
  assert.equal(classified[0].detectedLabel, null)
})

test('runGenerationJob treats already-completed 409 as success and does not refund', async () => {
  const rpcCalls = []
  const client = createJobClient({
    generationStatus: 'succeeded',
    onRpc: (name) => rpcCalls.push(name),
  })
  const result = await runGenerationJob({
    client,
    userId: USER_ID,
    accessToken: 'token',
    file: new Blob(['x'], { type: 'image/jpeg' }),
    generationType: 'photo',
    categoryId: 'other',
    objectCount: 2,
    compress: async (file) => file,
    classify: async () => {},
    generate: async () => {
      throw new GenerateCardImageError('Generation already completed', {
        code: 'generation_conflict',
        status: 409,
      })
    },
  })
  assert.equal(result.generationId, GENERATION_ID)
  assert.ok(!rpcCalls.includes('fail_own_generation'))
})

test('runGenerationJob surfaces a refund RPC error', async () => {
  const client = createJobClient({
    generationStatus: 'running',
    failError: { message: 'Refund failed' },
  })
  await assert.rejects(
    () =>
      runGenerationJob({
        client,
        userId: USER_ID,
        accessToken: 'token',
        file: new Blob(['x'], { type: 'image/jpeg' }),
        generationType: 'photo',
        categoryId: 'other',
        objectCount: 1,
        compress: async (file) => file,
        classify: async () => {},
        generate: async () => {
          throw new GenerateCardImageError('Image generation failed', {
            code: 'upstream_error',
            status: 502,
          })
        },
      }),
    (error) => error.code === 'rpc_error' && /Refund failed/.test(error.message),
  )
})

test('runGenerationJob does not refund on persist_rejected', async () => {
  const rpcCalls = []
  const client = createJobClient({
    generationStatus: 'failed',
    onRpc: (name) => rpcCalls.push(name),
  })
  await assert.rejects(
    () =>
      runGenerationJob({
        client,
        userId: USER_ID,
        accessToken: 'token',
        file: new Blob(['x'], { type: 'image/jpeg' }),
        generationType: 'photo',
        categoryId: 'other',
        objectCount: 2,
        compress: async (file) => file,
        classify: async () => {},
        generate: async () => {
          throw new GenerateCardImageError('Generation is not running', {
            code: 'persist_rejected',
            status: 409,
          })
        },
      }),
    (error) => error.code === 'persist_rejected',
  )
  assert.ok(!rpcCalls.includes('fail_own_generation'))
})

test('runGenerationJob does not fail on abort if the server already completed', async () => {
  const rpcCalls = []
  const client = createJobClient({
    generationStatus: 'succeeded',
    onRpc: (name) => rpcCalls.push(name),
  })
  const controller = new AbortController()
  const result = await runGenerationJob({
    client,
    userId: USER_ID,
    accessToken: 'token',
    file: new Blob(['x'], { type: 'image/jpeg' }),
    generationType: 'photo',
    categoryId: 'other',
    objectCount: 2,
    signal: controller.signal,
    compress: async (file) => file,
    classify: async () => {},
    generate: async (_input, options) => {
      controller.abort()
      if (options.signal?.aborted) {
        throw new GenerateCardImageError('Image generation was aborted', {
          code: 'aborted',
          status: 0,
        })
      }
      return { ok: true, image: { url: 'https://signed.example/out.png' } }
    },
  })
  assert.equal(result.generationId, GENERATION_ID)
  assert.ok(!rpcCalls.includes('fail_own_generation'))
})

test('failOwnGeneration throws when the refund RPC fails', async () => {
  await assert.rejects(
    () =>
      failOwnGeneration(
        {
          rpc: async () => ({ error: { message: 'Refund failed' } }),
        },
        GENERATION_ID,
        'boom',
      ),
    /Refund failed/,
  )
})

function createJobClient(options = {}) {
  return {
    storage: {
      from() {
        return {
          upload: async () => ({ error: null }),
        }
      },
    },
    from(table) {
      const query = {
        insert() {
          return query
        },
        select() {
          return query
        },
        eq() {
          return query
        },
        single: async () => ({ data: { id: PRODUCT_ID }, error: null }),
        maybeSingle: async () => {
          if (table === 'generations') {
            return { data: { status: options.generationStatus ?? 'running' }, error: null }
          }
          return { data: null, error: null }
        },
      }
      return query
    },
    rpc: async (name) => {
      options.onRpc?.(name)
      if (name === 'start_generation') return { data: GENERATION_ID, error: null }
      if (name === 'fail_own_generation') {
        return { data: null, error: options.failError ?? null }
      }
      return { data: null, error: null }
    },
  }
}
