import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  loadGenerationConfig,
  MAX_REQUEST_BODY_BYTES,
  MAX_RESPONSE_JSON_BYTES,
} from './config.js'
import { GenerationError } from './errors.js'
import {
  generateCardImage,
  mapOpenRouterError,
  normalizeInput,
} from './generateCardImage.js'
import { dispatchGenerateCard, jsonResponse } from './http.js'
import { buildImagePrompt } from './prompt.js'

const env = {
  OPENROUTER_API_KEY: 'test-key',
  OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1',
  OPENROUTER_IMAGE_MODEL: 'google/gemini-3.1-flash-image',
}

test('loadGenerationConfig requires OPENROUTER_API_KEY', () => {
  assert.throws(() => loadGenerationConfig({}), (error) => {
    assert.equal(error.code, 'config_error')
    return true
  })
})

test('buildImagePrompt weaves presentation and wishes into marketplace cards', () => {
  const card = buildImagePrompt({
    generationType: 'card',
    presentationPrompt: 'Isolated on pure white background, catalog cutout',
    wishes: 'акцент на фактуре',
    sourceImage: { url: 'https://example.com/p.png' },
  })
  assert.match(card, /marketplace product card/i)
  assert.match(card, /Presentation: Isolated on pure white/)
  assert.match(card, /акцент на фактуре/)
  assert.match(card, /reference photo/)

  const photo = buildImagePrompt({ generationType: 'photo', prompt: 'soft light' })
  assert.match(photo, /commercial product photograph/i)
  assert.match(photo, /soft light/)
})

test('normalizeInput validates generation fields', () => {
  assert.throws(() => normalizeInput({}), /prompt, wishes, or presentationPrompt/)
  assert.throws(
    () => normalizeInput({ prompt: 'x', generationType: 'video' }),
    /generationType/,
  )
  assert.throws(
    () => normalizeInput({ prompt: 'x', aspectRatio: '7:7' }),
    /aspectRatio/,
  )
  assert.throws(
    () => normalizeInput({ prompt: 'x', sourceImage: { url: 'http://insecure.example/a.png' } }),
    /https/,
  )

  const parsed = normalizeInput({
    wishes: '  светлый фон  ',
    presentationPrompt: 'Studio lighting',
    sourceImage: { url: 'https://cdn.example/product.jpg' },
  })
  assert.equal(parsed.generationType, 'card')
  assert.equal(parsed.wishes, 'светлый фон')
  assert.equal(parsed.aspectRatio, '1:1')
  assert.equal(parsed.resolution, '1K')
  assert.equal(parsed.sourceImageUrl, 'https://cdn.example/product.jpg')
})

test('normalizeInput wraps base64 source images as data URLs', () => {
  const parsed = normalizeInput({
    prompt: 'card',
    sourceImage: { base64: 'aGVsbG8=', mediaType: 'image/jpeg' },
  })
  assert.equal(parsed.sourceImageUrl, 'data:image/jpeg;base64,aGVsbG8=')
})

test('normalizeInput maps image/jpg source images to image/jpeg data URLs', () => {
  const fromBase64 = normalizeInput({
    prompt: 'card',
    sourceImage: { base64: 'aGVsbG8=', mediaType: 'image/jpg' },
  })
  assert.equal(fromBase64.sourceImageUrl, 'data:image/jpeg;base64,aGVsbG8=')

  const fromUrl = normalizeInput({
    prompt: 'card',
    sourceImage: { url: 'data:image/jpg;base64,aGVsbG8=' },
  })
  assert.equal(fromUrl.sourceImageUrl, 'data:image/jpeg;base64,aGVsbG8=')
})

test('generateCardImage posts to OpenRouter Image API and normalizes the result', async () => {
  const calls = []
  const fetchMock = async (url, init) => {
    calls.push({ url, init })
    return new Response(
      JSON.stringify({
        created: 1,
        data: [{ b64_json: 'aW1n', media_type: 'image/png' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          cost: 0.01,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const result = await generateCardImage(
    {
      generationType: 'card',
      wishes: 'белый фон',
      sourceImage: { url: 'https://cdn.example/item.png' },
    },
    { fetch: fetchMock, env },
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://openrouter.test/api/v1/images')
  const payload = JSON.parse(calls[0].init.body)
  assert.equal(payload.model, 'google/gemini-3.1-flash-image')
  assert.equal(payload.n, 1)
  assert.equal(payload.aspect_ratio, '1:1')
  assert.equal(payload.resolution, '1K')
  assert.deepEqual(payload.input_references, [
    { type: 'image_url', image_url: { url: 'https://cdn.example/item.png' } },
  ])
  assert.match(payload.prompt, /marketplace product card/i)
  assert.match(payload.prompt, /белый фон/)
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key')

  assert.equal(result.ok, true)
  assert.equal(result.image.base64, 'aW1n')
  assert.equal(result.image.mediaType, 'image/png')
  assert.equal(result.image.dataUrl, undefined)
  assert.equal(result.images, undefined)
  assert.equal(result.usage.cost, 0.01)
})

test('generateCardImage normalizes image/jpg to image/jpeg', async () => {
  const result = await generateCardImage(
    { prompt: 'x' },
    {
      env,
      fetch: async () =>
        new Response(
          JSON.stringify({ data: [{ b64_json: 'aW1n', media_type: 'image/jpg' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    },
  )
  assert.equal(result.image.mediaType, 'image/jpeg')
  assert.equal(result.image.base64, 'aW1n')
})

test('generateCardImage maps OpenRouter failures and empty image payloads', async () => {
  await assert.rejects(
    () =>
      generateCardImage(
        { prompt: 'x' },
        {
          env,
          fetch: async () =>
            new Response(JSON.stringify({ error: { message: 'Insufficient credits' } }), {
              status: 402,
            }),
        },
      ),
    (error) => {
      assert.equal(error.code, 'payment_required')
      assert.equal(error.status, 402)
      return true
    },
  )

  await assert.rejects(
    () =>
      generateCardImage(
        { prompt: 'x' },
        {
          env,
          fetch: async () =>
            new Response(JSON.stringify({ data: [] }), { status: 200 }),
        },
      ),
    (error) => {
      assert.equal(error.code, 'upstream_error')
      return true
    },
  )
})

test('generateCardImage maps abort/timeout to 504', async () => {
  const abortError = new Error('aborted')
  abortError.name = 'TimeoutError'
  await assert.rejects(
    () =>
      generateCardImage(
        { prompt: 'x' },
        {
          env,
          fetch: async () => {
            throw abortError
          },
        },
      ),
    (error) => {
      assert.equal(error.code, 'timeout')
      assert.equal(error.status, 504)
      return true
    },
  )
})

test('mapOpenRouterError hides raw 401 as upstream failure', () => {
  const error = mapOpenRouterError({ error: { message: 'Invalid key' } }, 401)
  assert.ok(error instanceof GenerationError)
  assert.equal(error.code, 'upstream_error')
  assert.equal(error.status, 502)
  assert.equal(error.message, 'Image generation failed')
  assert.doesNotMatch(error.message, /Invalid key/)
})

const TEST_USER = { id: '11111111-1111-4111-8111-111111111111' }
const TEST_GENERATION_ID = '22222222-2222-4222-8222-222222222222'

function testHttpDeps(overrides = {}) {
  return {
    authenticate: async () => TEST_USER,
    loadGenerationJob: async () => ({
      cached: false,
      generationId: TEST_GENERATION_ID,
      userId: TEST_USER.id,
      generationType: 'card',
      wishes: 'hello',
      presentationPrompt: 'Studio lighting',
      sourceImageUrl: 'https://cdn.example/product.jpg',
      sortOrder: 0,
      objectCount: 1,
      status: 'running',
    }),
    saveGeneratedImage: async (_user, job, result) => ({
      storagePath: `${TEST_USER.id}/${job.generationId}/00.png`,
      signedUrl: 'https://signed.example/out.png',
      status: 'succeeded',
      sortOrder: 0,
      mediaType: result.image.mediaType,
    }),
    failGeneration: async () => {},
    ...overrides,
  }
}

describe('generation HTTP contract', { concurrency: 1 }, () => {
  test('dispatchGenerateCard rejects non-POST, unauthenticated, and invalid JSON', async () => {
    const getRes = await dispatchGenerateCard({ method: 'GET', url: '/api/generate-card' })
    assert.equal(getRes.status, 405)

    const noAuth = await dispatchGenerateCard({
      method: 'POST',
      body: { generationId: TEST_GENERATION_ID },
    })
    assert.equal(noAuth.status, 401)
    const noAuthPayload = await noAuth.json()
    assert.equal(noAuthPayload.error.code, 'unauthorized')

    const badJson = await dispatchGenerateCard(
      {
        method: 'POST',
        url: '/api/generate-card',
        body: '{',
      },
      testHttpDeps(),
    )
    assert.equal(badJson.status, 400)
    const badPayload = await badJson.json()
    assert.equal(badPayload.ok, false)
    assert.equal(badPayload.error.code, 'validation_error')

    const empty = await dispatchGenerateCard(
      {
        method: 'POST',
        url: '/api/generate-card',
        body: {},
      },
      testHttpDeps({
        loadGenerationJob: async () => {
          throw new GenerationError('generationId is required', {
            code: 'validation_error',
            status: 400,
          })
        },
      }),
    )
    assert.equal(empty.status, 400)
  })

  test('HTTP generate weaves wishes and presentation into the image prompt', async () => {
    let seenPrompt = ''
    const res = await dispatchGenerateCard(
      {
        method: 'POST',
        body: { generationId: TEST_GENERATION_ID, sortOrder: 0 },
      },
      testHttpDeps({
        generateCardImage: async (input) => {
          seenPrompt = buildImagePrompt({
            ...input,
            sourceImage: { url: input.sourceImage?.url },
          })
          return {
            ok: true,
            model: 'test',
            prompt: seenPrompt,
            image: { mediaType: 'image/png', base64: 'aW1n', url: null },
            usage: null,
          }
        },
      }),
    )
    assert.equal(res.status, 200)
    assert.match(seenPrompt, /Presentation: Studio lighting/)
    assert.match(seenPrompt, /hello/)
  })

  test('HTTP success JSON stores the image and does not echo base64', async () => {
    const b64 = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='
    await withHttpMocks(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: b64, media_type: 'image/png' }] }), {
          status: 200,
        }),
      async () => {
        const res = await dispatchGenerateCard(
          {
            method: 'POST',
            body: { generationId: TEST_GENERATION_ID, sortOrder: 0 },
          },
          testHttpDeps(),
        )
        assert.equal(res.status, 200)
        const text = await res.text()
        assert.equal(text.split(b64).length - 1, 0)
        const payload = JSON.parse(text)
        assert.equal(payload.image.base64, null)
        assert.equal(payload.image.url, 'https://signed.example/out.png')
        assert.equal(payload.image.dataUrl, undefined)
        assert.equal(payload.images, undefined)
        assert.equal(payload.generation.id, TEST_GENERATION_ID)
        assert.equal(payload.generation.status, 'succeeded')
      },
    )
  })

  test('401 from OpenRouter does not leak Invalid key to the client', async () => {
    await withHttpMocks(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid key' } }), { status: 401 }),
      async () => {
        const res = await dispatchGenerateCard(
          {
            method: 'POST',
            body: { generationId: TEST_GENERATION_ID },
          },
          testHttpDeps(),
        )
        const text = await res.text()
        const payload = JSON.parse(text)
        assert.equal(res.status, 502)
        assert.equal(payload.error.code, 'upstream_error')
        assert.equal(payload.error.message, 'Image generation failed')
        assert.doesNotMatch(text, /Invalid key/)
      },
    )
  })

  test('missing OPENROUTER_API_KEY is not returned to the client', async () => {
    const originalKey = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    try {
      const res = await dispatchGenerateCard(
        {
          method: 'POST',
          body: { generationId: TEST_GENERATION_ID },
        },
        testHttpDeps(),
      )
      const text = await res.text()
      const payload = JSON.parse(text)
      assert.equal(payload.ok, false)
      assert.equal(payload.error.code, 'upstream_error')
      assert.equal(payload.error.message, 'Image generation failed')
      assert.doesNotMatch(text, /OPENROUTER_API_KEY is not configured/)
    } finally {
      if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = originalKey
    }
  })

  test('oversized request body returns JSON 413', async () => {
    const res = await dispatchGenerateCard(
      {
        method: 'POST',
        body: 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1),
      },
      testHttpDeps(),
    )
    assert.equal(res.status, 413)
    const payload = await res.json()
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'payload_too_large')
  })

  test('failGeneration is skipped when persist already recorded the frame', async () => {
    const failCalls = []
    const res = await dispatchGenerateCard(
      {
        method: 'POST',
        body: { generationId: TEST_GENERATION_ID, sortOrder: 0 },
      },
      testHttpDeps({
        generateCardImage: async () => ({
          ok: true,
          model: 'test',
          prompt: 'x',
          image: { mediaType: 'image/png', base64: 'aW1n', url: null },
          usage: null,
        }),
        saveGeneratedImage: async () => {
          const error = new GenerationError('sign failed', {
            code: 'upstream_error',
            status: 502,
          })
          error.persisted = true
          throw error
        },
        failGeneration: async () => {
          failCalls.push('fail')
        },
      }),
    )
    assert.equal(res.status, 502)
    assert.deepEqual(failCalls, [])
  })

  test('failGeneration is skipped on persist_rejected after a prior saved frame', async () => {
    const failCalls = []
    const res = await dispatchGenerateCard(
      {
        method: 'POST',
        body: { generationId: TEST_GENERATION_ID, sortOrder: 1 },
      },
      testHttpDeps({
        generateCardImage: async () => ({
          ok: true,
          model: 'test',
          prompt: 'x',
          image: { mediaType: 'image/png', base64: 'aW1n', url: null },
          usage: null,
        }),
        saveGeneratedImage: async () => {
          throw new GenerationError('Generation is not running', {
            code: 'persist_rejected',
            status: 409,
          })
        },
        failGeneration: async () => {
          failCalls.push('fail')
        },
      }),
    )
    assert.equal(res.status, 409)
    assert.deepEqual(failCalls, [])
  })

  test('failGeneration runs when the model fails before persist', async () => {
    const failCalls = []
    const res = await dispatchGenerateCard(
      {
        method: 'POST',
        body: { generationId: TEST_GENERATION_ID, sortOrder: 0 },
      },
      testHttpDeps({
        generateCardImage: async () => {
          throw new GenerationError('Image generation failed', {
            code: 'upstream_error',
            status: 502,
          })
        },
        failGeneration: async () => {
          failCalls.push('fail')
        },
      }),
    )
    assert.equal(res.status, 502)
    assert.deepEqual(failCalls, ['fail'])
  })

  test('oversized Content-Length returns JSON 413 before reading', async () => {
    const res = await dispatchGenerateCard(
      {
        method: 'POST',
        headers: { 'content-length': String(MAX_REQUEST_BODY_BYTES + 1) },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('{"generationId":"22222222-2222-4222-8222-222222222222"}')
        },
      },
      testHttpDeps(),
    )
    assert.equal(res.status, 413)
    const payload = await res.json()
    assert.equal(payload.error.code, 'payload_too_large')
  })
})

test('jsonResponse returns 413 when the generated payload is too large', async () => {
  const res = jsonResponse(200, {
    ok: true,
    image: {
      mediaType: 'image/png',
      base64: 'A'.repeat(MAX_RESPONSE_JSON_BYTES + 1),
      url: null,
    },
  })
  assert.equal(res.status, 413)
  const payload = await res.json()
  assert.equal(payload.ok, false)
  assert.equal(payload.error.code, 'payload_too_large')
})

/**
 * @param {typeof fetch} fetchImpl
 * @param {() => Promise<void>} run
 */
async function withHttpMocks(fetchImpl, run) {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.OPENROUTER_API_KEY
  globalThis.fetch = fetchImpl
  process.env.OPENROUTER_API_KEY = 'test-key'
  try {
    await run()
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = originalKey
  }
}
