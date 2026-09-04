import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GenerationError } from './errors.js'
import {
  completeIfReady,
  extensionForMediaType,
  imageBytesFromResult,
  loadProductSource,
  outputStoragePath,
  readGenerationId,
  readProductId,
  readSortOrder,
  refundPointsForRemaining,
  saveGeneratedImage,
  shouldFailGeneration,
  toPersistedImagePayload,
} from './persist.js'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '99999999-9999-4999-8999-999999999999'
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333'

test('loadProductSource signs an owned product and hides others', async () => {
  const own = await loadProductSource(
    { id: OWNER_ID },
    { productId: PRODUCT_ID },
    { admin: createProductAdmin({ userId: OWNER_ID }) },
  )
  assert.equal(own.productId, PRODUCT_ID)
  assert.equal(own.sourceImageUrl, 'https://signed.example/source.jpg')

  await assert.rejects(
    () =>
      loadProductSource({ id: OWNER_ID }, { productId: PRODUCT_ID }, {
        admin: createProductAdmin({ userId: OTHER_ID }),
      }),
    (error) => error instanceof GenerationError && error.code === 'not_found' && error.status === 404,
  )

  await assert.rejects(
    () =>
      loadProductSource({ id: OWNER_ID }, { productId: PRODUCT_ID }, {
        admin: createProductAdmin({ userId: OWNER_ID, productError: { message: 'db down' } }),
      }),
    (error) => error instanceof GenerationError && error.code === 'upstream_error' && error.status === 502,
  )

  await assert.rejects(
    () =>
      loadProductSource({ id: OWNER_ID }, { productId: PRODUCT_ID }, {
        admin: createProductAdmin({ userId: OWNER_ID, signError: new Error('sign failed') }),
      }),
    (error) => error instanceof GenerationError && error.code === 'upstream_error' && error.status === 502,
  )
})

test('readProductId requires a uuid', () => {
  assert.equal(
    readProductId({ productId: '33333333-3333-4333-8333-333333333333' }),
    '33333333-3333-4333-8333-333333333333',
  )
  assert.throws(() => readProductId({}), /productId/)
  assert.throws(() => readProductId({ productId: 'nope' }), /productId/)
})

test('readGenerationId requires a uuid', () => {
  assert.equal(
    readGenerationId({ generationId: '22222222-2222-4222-8222-222222222222' }),
    '22222222-2222-4222-8222-222222222222',
  )
  assert.throws(() => readGenerationId({}), /generationId/)
  assert.throws(() => readGenerationId({ generationId: 'nope' }), /generationId/)
})

test('readSortOrder stays within object_count', () => {
  assert.equal(readSortOrder({}, 3), 0)
  assert.equal(readSortOrder({ sortOrder: 2 }, 3), 2)
  assert.throws(() => readSortOrder({ sortOrder: 3 }, 3), /sortOrder/)
  assert.throws(() => readSortOrder({ sortOrder: -1 }, 3), /sortOrder/)
})

test('outputStoragePath keeps user and generation folders', () => {
  const path = outputStoragePath(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    4,
    'image/jpeg',
  )
  assert.equal(
    path,
    '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/04.jpg',
  )
  assert.equal(extensionForMediaType('image/webp'), 'webp')
  assert.equal(extensionForMediaType('image/png'), 'png')
})

test('toPersistedImagePayload drops base64 and keeps a storage URL', () => {
  const persisted = toPersistedImagePayload(
    {
      ok: true,
      model: 'google/gemini-3.1-flash-image',
      prompt: 'x',
      image: { mediaType: 'image/png', base64: 'aW1n', url: null },
      usage: null,
    },
    'https://signed.example/out.png',
  )
  assert.equal(persisted.image.base64, null)
  assert.equal(persisted.image.url, 'https://signed.example/out.png')
  assert.equal(persisted.image.dataUrl, undefined)
})

test('imageBytesFromResult prefers base64 and can download a URL', async () => {
  const fromB64 = await imageBytesFromResult(
    { mediaType: 'image/png', base64: 'aW1n', url: null },
    async () => {
      throw new Error('should not fetch')
    },
  )
  assert.equal(fromB64.buffer.toString(), 'img')

  const fromUrl = await imageBytesFromResult(
    { mediaType: 'image/jpeg', base64: null, url: 'https://cdn.example/out.jpg' },
    async () => new Response(Buffer.from('file'), { status: 200 }),
  )
  assert.equal(fromUrl.mediaType, 'image/jpeg')
  assert.equal(fromUrl.buffer.toString(), 'file')
})

test('refundPointsForRemaining refunds only unsaved frames', () => {
  assert.equal(refundPointsForRemaining(120, 3, 0), 120)
  assert.equal(refundPointsForRemaining(120, 3, 1), 80)
  assert.equal(refundPointsForRemaining(120, 3, 3), 0)
})

test('shouldFailGeneration skips persist_rejected and already persisted frames', () => {
  assert.equal(shouldFailGeneration({ code: 'upstream_error' }), true)
  assert.equal(shouldFailGeneration({ code: 'persist_rejected' }), false)
  assert.equal(shouldFailGeneration({ code: 'generation_conflict' }), false)
  assert.equal(shouldFailGeneration({ code: 'upstream_error' }, { persisted: true }), false)
  assert.equal(shouldFailGeneration({ code: 'upstream_error', persisted: true }), false)
})

test('completeIfReady returns the actual generation status, not a hardcoded succeeded', async () => {
  const admin = createAdminMock({
    assetCount: 2,
    updateRows: [],
    currentStatus: 'failed',
  })
  const status = await completeIfReady(admin, '22222222-2222-4222-8222-222222222222', 2)
  assert.equal(status, 'failed')
})

test('saveGeneratedImage does not write an asset when the generation is not running', async () => {
  const calls = []
  const admin = createAdminMock({
    claim: false,
    onRpc: (name) => calls.push(name),
  })
  await assert.rejects(
    () =>
      saveGeneratedImage(
        { id: '11111111-1111-4111-8111-111111111111' },
        {
          generationId: '22222222-2222-4222-8222-222222222222',
          sortOrder: 0,
          objectCount: 2,
        },
        { image: { mediaType: 'image/png', base64: 'aW1n', url: null } },
        { admin },
      ),
    (error) => error.code === 'persist_rejected',
  )
  assert.equal(admin.uploaded, false)
  assert.ok(!calls.includes('persist_generation_asset'))
})

test('saveGeneratedImage keeps persist success if signing fails after the asset is stored', async () => {
  const admin = createAdminMock({
    claim: true,
    persist: { accepted: true, status: 'running' },
    assetCount: 1,
    currentStatus: 'running',
    signError: new Error('sign failed'),
  })
  const saved = await saveGeneratedImage(
    { id: '11111111-1111-4111-8111-111111111111' },
    {
      generationId: '22222222-2222-4222-8222-222222222222',
      sortOrder: 0,
      objectCount: 2,
    },
    { image: { mediaType: 'image/png', base64: 'aW1n', url: null } },
    { admin },
  )
  assert.equal(saved.persisted, true)
  assert.equal(saved.signedUrl, null)
  assert.equal(saved.status, 'running')
  assert.equal(admin.uploaded, true)
})

function createProductAdmin(options = {}) {
  const product =
    options.product === null
      ? null
      : {
          id: PRODUCT_ID,
          user_id: options.userId ?? OWNER_ID,
          source_path: options.sourcePath ?? `${OWNER_ID}/source.jpg`,
          detected_label: null,
          category_id: null,
        }

  return {
    from(table) {
      const query = {
        select() {
          return query
        },
        eq() {
          return query
        },
        maybeSingle: async () => {
          if (table === 'products') {
            return { data: product, error: options.productError ?? null }
          }
          if (table === 'categories') {
            return { data: options.categoryTitle ? { title: options.categoryTitle } : null, error: null }
          }
          return { data: null, error: null }
        },
      }
      return query
    },
    storage: {
      from() {
        return {
          createSignedUrl: async () => {
            if (options.signError) return { data: null, error: options.signError }
            return { data: { signedUrl: 'https://signed.example/source.jpg' }, error: null }
          },
        }
      },
    },
  }
}

function createAdminMock(options = {}) {
  const state = {
    uploaded: false,
    claim: options.claim ?? true,
    persist: options.persist ?? { accepted: true, status: 'running' },
    assetCount: options.assetCount ?? 0,
    updateRows: options.updateRows,
    currentStatus: options.currentStatus ?? 'running',
    signError: options.signError ?? null,
    onRpc: options.onRpc,
  }

  const from = (table) => {
    const query = {
      select() {
        return query
      },
      eq() {
        return query
      },
      update() {
        return query
      },
      maybeSingle: async () => ({ data: { status: state.currentStatus }, error: null }),
      then(resolve) {
        if (table === 'generation_assets') {
          resolve({ count: state.assetCount, error: null })
          return
        }
        resolve({
          data: state.updateRows === undefined ? [{ status: 'succeeded' }] : state.updateRows,
          error: null,
        })
      },
    }
    return query
  }

  return {
    get uploaded() {
      return state.uploaded
    },
    rpc: async (name) => {
      state.onRpc?.(name)
      if (name === 'claim_generation_persist') return { data: state.claim, error: null }
      if (name === 'persist_generation_asset') return { data: state.persist, error: null }
      return { data: null, error: null }
    },
    from,
    storage: {
      from() {
        return {
          upload: async () => {
            state.uploaded = true
            return { error: null }
          },
          createSignedUrl: async () => {
            if (state.signError) return { data: null, error: state.signError }
            return { data: { signedUrl: 'https://signed.example/out.png' }, error: null }
          },
        }
      },
    },
  }
}
