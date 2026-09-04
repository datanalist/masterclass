import { Buffer } from 'node:buffer'
import { GenerationError, validationError } from './errors.js'
import { createServiceClient } from './supabase.js'

export const PRODUCT_UPLOADS_BUCKET = 'product-uploads'
export const GENERATION_OUTPUTS_BUCKET = 'generation-outputs'
export const SOURCE_SIGNED_URL_TTL_SEC = 600
export const OUTPUT_SIGNED_URL_TTL_SEC = 3600

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * @param {unknown} payload
 * @returns {string}
 */
export function readGenerationId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('generationId is required')
  }
  const value = payload.generationId ?? payload.generation_id
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw validationError('generationId is required')
  }
  return value.trim()
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
export function readProductId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('productId is required')
  }
  const value = payload.productId ?? payload.product_id
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw validationError('productId is required')
  }
  return value.trim()
}

/**
 * Loads a product the user owns and signs its source image. Used by key-subject detect.
 * @param {{ id: string }} user
 * @param {unknown} payload
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>, admin?: object }} [deps]
 */
export async function loadProductSource(user, payload, deps = {}) {
  const productId = readProductId(payload)
  const admin = deps.admin ?? createServiceClient(deps.env)

  const { data: product, error } = await admin
    .from('products')
    .select('id, user_id, source_path, detected_label, category_id')
    .eq('id', productId)
    .maybeSingle()

  if (error) {
    throw new GenerationError('Failed to load product', {
      code: 'upstream_error',
      status: 502,
      cause: error,
    })
  }

  if (!product || product.user_id !== user.id) {
    throw new GenerationError('Product not found', {
      code: 'not_found',
      status: 404,
    })
  }

  if (!product.source_path) {
    throw new GenerationError('Product source image is missing', {
      code: 'validation_error',
      status: 400,
    })
  }

  const { data: signed, error: signError } = await admin.storage
    .from(PRODUCT_UPLOADS_BUCKET)
    .createSignedUrl(product.source_path, SOURCE_SIGNED_URL_TTL_SEC)

  if (signError || !signed?.signedUrl) {
    throw new GenerationError('Failed to sign product image URL', {
      code: 'upstream_error',
      status: 502,
      cause: signError,
    })
  }

  const categoryId = readOptionalCategoryId(payload) ?? product.category_id
  const categoryTitle = categoryId ? await readCategoryTitle(admin, categoryId) : null

  return {
    productId: product.id,
    sourceImageUrl: signed.signedUrl,
    detectedLabel: product.detected_label ?? null,
    categoryId: categoryId ?? null,
    categoryTitle,
  }
}

/** @param {unknown} payload */
function readOptionalCategoryId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const value = payload.categoryId ?? payload.category_id
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

/** @param {object} admin @param {string} categoryId */
async function readCategoryTitle(admin, categoryId) {
  const { data, error } = await admin
    .from('categories')
    .select('title')
    .eq('id', categoryId)
    .maybeSingle()
  if (error || !data?.title) return null
  return data.title
}

/**
 * @param {unknown} payload
 * @param {number} objectCount
 */
export function readSortOrder(payload, objectCount) {
  const raw =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload.sortOrder ?? payload.sort_order)
      : undefined
  if (raw == null || raw === '') return 0
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  if (!Number.isInteger(value) || value < 0 || value >= objectCount) {
    throw validationError('sortOrder is out of range')
  }
  return value
}

/**
 * @param {string} mediaType
 */
export function extensionForMediaType(mediaType) {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  return 'png'
}

/**
 * @param {string} userId
 * @param {string} generationId
 * @param {number} sortOrder
 * @param {string} mediaType
 */
export function outputStoragePath(userId, generationId, sortOrder, mediaType) {
  const order = String(sortOrder).padStart(2, '0')
  return `${userId}/${generationId}/${order}.${extensionForMediaType(mediaType)}`
}

/**
 * @param {{ image: { mediaType: string, base64: string | null, url: string | null }, [key: string]: unknown }} result
 * @param {string} signedUrl
 */
export function toPersistedImagePayload(result, signedUrl) {
  return {
    ...result,
    image: {
      mediaType: result.image.mediaType,
      base64: null,
      url: signedUrl,
    },
  }
}

/**
 * @param {{ headers?: Record<string, unknown>, body?: unknown }} req
 * @param {{ id: string }} user
 * @param {unknown} payload
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>, admin?: object, fetch?: typeof fetch }} [deps]
 */
export async function loadGenerationJob(user, payload, deps = {}) {
  const generationId = readGenerationId(payload)
  const admin = deps.admin ?? createServiceClient(deps.env)

  const { data: generation, error } = await admin
    .from('generations')
    .select(
      'id, user_id, product_id, generation_type, presentation_preset_id, wishes, object_count, status, error_message, products ( id, source_path, user_id, detected_label ), presentation_presets ( prompt )',
    )
    .eq('id', generationId)
    .maybeSingle()

  if (error) {
    throw new GenerationError('Failed to load generation', {
      code: 'upstream_error',
      status: 502,
      cause: error,
    })
  }

  if (!generation || generation.user_id !== user.id) {
    throw new GenerationError('Generation not found', {
      code: 'generation_not_found',
      status: 404,
    })
  }

  if (generation.status === 'succeeded' || generation.status === 'failed') {
    throw new GenerationError(
      generation.status === 'succeeded'
        ? 'Generation already completed'
        : 'Generation already failed',
      { code: 'generation_conflict', status: 409 },
    )
  }

  const product = generation.products
  if (!product?.source_path) {
    throw new GenerationError('Product source image is missing', {
      code: 'validation_error',
      status: 400,
    })
  }

  const sortOrder = readSortOrder(payload, generation.object_count)

  const { data: existingAsset } = await admin
    .from('generation_assets')
    .select('storage_path')
    .eq('generation_id', generation.id)
    .eq('sort_order', sortOrder)
    .maybeSingle()

  if (generation.status === 'queued') {
    const { error: runningError } = await admin
      .from('generations')
      .update({ status: 'running', error_message: null })
      .eq('id', generation.id)
      .eq('status', 'queued')
    if (runningError) {
      throw new GenerationError('Failed to start generation', {
        code: 'upstream_error',
        status: 502,
        cause: runningError,
      })
    }
  }

  if (existingAsset?.storage_path) {
    const signedUrl = await signOutputPath(admin, existingAsset.storage_path)
    const status = await completeIfReady(admin, generation.id, generation.object_count)
    return {
      cached: true,
      generationId: generation.id,
      userId: generation.user_id,
      generationType: generation.generation_type,
      wishes: generation.wishes,
      presentationPrompt: generation.presentation_presets?.prompt ?? null,
      detectedLabel: product.detected_label ?? null,
      sourceImageUrl: null,
      sortOrder,
      objectCount: generation.object_count,
      status,
      storagePath: existingAsset.storage_path,
      signedUrl,
      mediaType: mediaTypeFromPath(existingAsset.storage_path),
    }
  }

  const { data: signed, error: signError } = await admin.storage
    .from(PRODUCT_UPLOADS_BUCKET)
    .createSignedUrl(product.source_path, SOURCE_SIGNED_URL_TTL_SEC)

  if (signError || !signed?.signedUrl) {
    throw new GenerationError('Failed to sign product image URL', {
      code: 'upstream_error',
      status: 502,
      cause: signError,
    })
  }

  return {
    cached: false,
    generationId: generation.id,
    userId: generation.user_id,
    generationType: generation.generation_type,
    wishes: generation.wishes,
    presentationPrompt: generation.presentation_presets?.prompt ?? null,
    detectedLabel: product.detected_label ?? null,
    sourceImageUrl: signed.signedUrl,
    sortOrder,
    objectCount: generation.object_count,
    status: 'running',
    storagePath: null,
    signedUrl: null,
    mediaType: null,
    admin,
  }
}

/**
 * @param {{ id: string }} user
 * @param {Awaited<ReturnType<typeof loadGenerationJob>>} job
 * @param {{ image: { mediaType: string, base64: string | null, url: string | null } }} result
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>, admin?: object, fetch?: typeof fetch }} [deps]
 */
export async function saveGeneratedImage(user, job, result, deps = {}) {
  const admin = deps.admin ?? job.admin ?? createServiceClient(deps.env)
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const claimed = await claimGenerationPersist(admin, job.generationId)
  if (!claimed) {
    throw new GenerationError('Generation is not running', {
      code: 'persist_rejected',
      status: 409,
    })
  }

  const { buffer, mediaType } = await imageBytesFromResult(result.image, fetchImpl)
  const storagePath = outputStoragePath(user.id, job.generationId, job.sortOrder, mediaType)

  const { error: uploadError } = await admin.storage
    .from(GENERATION_OUTPUTS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mediaType,
      upsert: true,
    })

  if (uploadError) {
    throw new GenerationError('Failed to store generated image', {
      code: 'upstream_error',
      status: 502,
      cause: uploadError,
    })
  }

  const persistResult = await persistGenerationAsset(admin, {
    generationId: job.generationId,
    userId: user.id,
    storagePath,
    sortOrder: job.sortOrder,
  })

  if (!persistResult.accepted) {
    throw new GenerationError('Generation is not running', {
      code: 'persist_rejected',
      status: 409,
    })
  }

  const signed = await signOutputPathSafe(admin, storagePath)
  const status = await completeIfReady(admin, job.generationId, job.objectCount)

  return {
    storagePath,
    signedUrl: signed,
    status,
    sortOrder: job.sortOrder,
    mediaType,
    persisted: true,
  }
}

/**
 * @param {{ id: string }} user
 * @param {string} generationId
 * @param {string} [message]
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>, admin?: object }} [deps]
 */
export async function failGeneration(user, generationId, message, deps = {}) {
  const admin = deps.admin ?? createServiceClient(deps.env)
  const { error } = await admin.rpc('fail_generation', {
    p_generation_id: generationId,
    p_error_message: message ?? null,
  })
  if (error) {
    console.error('[generation] fail_generation', error)
  }
}

/**
 * @param {{ mediaType: string, base64: string | null, url: string | null }} image
 * @param {typeof fetch} fetchImpl
 */
export async function imageBytesFromResult(image, fetchImpl) {
  const mediaType = image.mediaType || 'image/png'
  if (typeof image.base64 === 'string' && image.base64) {
    return { buffer: Buffer.from(image.base64, 'base64'), mediaType }
  }
  if (typeof image.url === 'string' && image.url) {
    if (typeof fetchImpl !== 'function') {
      throw new GenerationError('Failed to download generated image', {
        code: 'upstream_error',
        status: 502,
      })
    }
    const response = await fetchImpl(image.url)
    if (!response.ok) {
      throw new GenerationError('Failed to download generated image', {
        code: 'upstream_error',
        status: 502,
      })
    }
    return { buffer: Buffer.from(await response.arrayBuffer()), mediaType }
  }
  throw new GenerationError('OpenRouter returned no image bytes', {
    code: 'upstream_error',
    status: 502,
  })
}

/**
 * Fail the generation only if this request has not already persisted a frame
 * and the job is not already in a terminal conflict.
 * @param {unknown} error
 * @param {{ persisted?: boolean }} [persistResult]
 */
export function shouldFailGeneration(error, persistResult = {}) {
  if (persistResult.persisted) return false
  if (error && typeof error === 'object' && error.persisted) return false
  const code =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'persist_rejected' || code === 'generation_conflict') return false
  return true
}

/**
 * @param {number} costPoints
 * @param {number} objectCount
 * @param {number} assetCount
 */
export function refundPointsForRemaining(costPoints, objectCount, assetCount) {
  if (!objectCount || objectCount < 1) return Math.max(0, costPoints)
  const saved = Math.min(Math.max(0, assetCount), objectCount)
  return Math.trunc(costPoints / objectCount) * (objectCount - saved)
}

/** @param {object} admin @param {string} generationId */
export async function claimGenerationPersist(admin, generationId) {
  const { data, error } = await admin.rpc('claim_generation_persist', {
    p_generation_id: generationId,
  })
  if (error) {
    throw new GenerationError('Failed to lock generation for persist', {
      code: 'upstream_error',
      status: 502,
      cause: error,
    })
  }
  return data === true
}

/**
 * @param {object} admin
 * @param {{ generationId: string, userId: string, storagePath: string, sortOrder: number }} input
 */
export async function persistGenerationAsset(admin, input) {
  const { data, error } = await admin.rpc('persist_generation_asset', {
    p_generation_id: input.generationId,
    p_user_id: input.userId,
    p_storage_path: input.storagePath,
    p_sort_order: input.sortOrder,
  })
  if (error) {
    throw new GenerationError('Failed to record generated image', {
      code: 'upstream_error',
      status: 502,
      cause: error,
    })
  }
  const accepted = Boolean(data?.accepted)
  const status = typeof data?.status === 'string' ? data.status : 'running'
  return { accepted, status }
}

/** @param {object} admin @param {string} generationId @param {number} objectCount */
export async function completeIfReady(admin, generationId, objectCount) {
  const { count, error } = await admin
    .from('generation_assets')
    .select('id', { count: 'exact', head: true })
    .eq('generation_id', generationId)

  if (error) {
    throw new GenerationError('Failed to count generated images', {
      code: 'upstream_error',
      status: 502,
      cause: error,
    })
  }

  if ((count ?? 0) < objectCount) {
    return readGenerationStatus(admin, generationId)
  }

  const { data, error: completeError } = await admin
    .from('generations')
    .update({
      status: 'succeeded',
      error_message: null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', generationId)
    .eq('status', 'running')
    .select('status')

  if (completeError) {
    throw new GenerationError('Failed to complete generation', {
      code: 'upstream_error',
      status: 502,
      cause: completeError,
    })
  }

  if (data?.[0]?.status) return data[0].status
  return readGenerationStatus(admin, generationId)
}

/** @param {object} admin @param {string} generationId */
async function readGenerationStatus(admin, generationId) {
  const { data, error } = await admin
    .from('generations')
    .select('status')
    .eq('id', generationId)
    .maybeSingle()
  if (error) {
    throw new GenerationError('Failed to read generation status', {
      code: 'upstream_error',
      status: 502,
      cause: error,
    })
  }
  return data?.status ?? 'running'
}

/** @param {object} admin @param {string} storagePath */
async function signOutputPathSafe(admin, storagePath) {
  try {
    return await signOutputPath(admin, storagePath)
  } catch (error) {
    console.error('[generation] sign after persist', error)
    return null
  }
}

/** @param {object} admin @param {string} storagePath */
async function signOutputPath(admin, storagePath) {
  const { data, error } = await admin.storage
    .from(GENERATION_OUTPUTS_BUCKET)
    .createSignedUrl(storagePath, OUTPUT_SIGNED_URL_TTL_SEC)
  if (error || !data?.signedUrl) {
    throw new GenerationError('Failed to sign generated image URL', {
      code: 'upstream_error',
      status: 502,
      cause: error,
    })
  }
  return data.signedUrl
}

/** @param {string} storagePath */
function mediaTypeFromPath(storagePath) {
  if (storagePath.endsWith('.jpg') || storagePath.endsWith('.jpeg')) return 'image/jpeg'
  if (storagePath.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}
