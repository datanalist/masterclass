import { classifyProduct } from './classifyProduct.js'
import { compressProductImage, extensionForBlob } from './compressProductImage.js'
import { GenerateCardImageError, generateCardImage } from './generateCardImage.js'

export const PRODUCT_UPLOADS_BUCKET = 'product-uploads'

export class GenerationJobError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'GenerationJobError'
    this.code = options.code ?? 'generation_error'
  }
}

/**
 * @typedef {object} RunGenerationJobInput
 * @property {import('@supabase/supabase-js').SupabaseClient} client
 * @property {string} userId
 * @property {string} accessToken
 * @property {File} file
 * @property {'photo' | 'card'} generationType
 * @property {string} categoryId
 * @property {string | null} [presentationPresetId]
 * @property {string} [wishes]
 * @property {number} objectCount
 * @property {AbortSignal} [signal]
 * @property {(phase: 'uploading' | 'queued' | 'running' | 'succeeded' | 'failed') => void} [onPhase]
 * @property {(progress: { current: number, total: number }) => void} [onProgress]
 * @property {typeof generateCardImage} [generate]
 * @property {(file: File) => Promise<Blob>} [compress]
 * @property {typeof classifyProduct} [classify]
 */

/**
 * Upload source → classify_product → charge via start_generation →
 * generate one OpenRouter image per object_count.
 *
 * @param {RunGenerationJobInput} input
 */
export async function runGenerationJob(input) {
  const {
    client,
    userId,
    accessToken,
    file,
    generationType,
    categoryId,
    presentationPresetId = null,
    wishes,
    objectCount,
    signal,
    onPhase,
    onProgress,
    generate = generateCardImage,
    compress = compressProductImage,
    classify = classifyProduct,
  } = input

  throwIfAborted(signal)

  let productId = null
  let sourcePath = null
  let generationId = null
  const images = []

  try {
    onPhase?.('uploading')
    const blob = await compress(file)
    throwIfAborted(signal)

    sourcePath = `${userId}/${crypto.randomUUID()}.${extensionForBlob(blob)}`
    const { error: uploadError } = await client.storage
      .from(PRODUCT_UPLOADS_BUCKET)
      .upload(sourcePath, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: false,
      })
    if (uploadError) {
      throw new GenerationJobError(uploadError.message || 'Не удалось загрузить фото', {
        code: 'upload_error',
        cause: uploadError,
      })
    }

    const { data: product, error: productError } = await client
      .from('products')
      .insert({ user_id: userId, source_path: sourcePath })
      .select('id')
      .single()
    if (productError || !product?.id) {
      throw new GenerationJobError(productError?.message || 'Не удалось сохранить товар', {
        code: 'product_error',
        cause: productError,
      })
    }
    productId = product.id

    await classify(client, { productId, categoryId, detectedLabel: null })
    throwIfAborted(signal)

    onPhase?.('queued')
    const { data: startedId, error: startError } = await client.rpc('start_generation', {
      p_product_id: productId,
      p_generation_type: generationType,
      p_presentation_preset_id: presentationPresetId,
      p_wishes: wishes?.trim() ? wishes.trim() : null,
      p_object_count: objectCount,
    })
    if (startError || !startedId) {
      throw mapRpcError(startError, 'Не удалось запустить генерацию')
    }
    generationId = startedId

    onPhase?.('running')
    for (let sortOrder = 0; sortOrder < objectCount; sortOrder += 1) {
      throwIfAborted(signal)
      onProgress?.({ current: sortOrder + 1, total: objectCount })
      const result = await generate(
        { generationId, sortOrder },
        {
          signal,
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      )
      images.push(result)
    }

    onPhase?.('succeeded')
    return { generationId, productId, images }
  } catch (error) {
    const mapped = mapJobError(error)
    if (generationId && isAlreadyCompletedConflict(mapped)) {
      onPhase?.('succeeded')
      return { generationId, productId, images }
    }

    if (generationId && mapped.code === 'persist_rejected') {
      const status = await readGenerationStatus(client, generationId)
      if (status === 'succeeded') {
        onPhase?.('succeeded')
        return { generationId, productId, images }
      }
      onPhase?.('failed')
      throw mapped
    }

    if (generationId && mapped.code === 'aborted') {
      const status = await readGenerationStatus(client, generationId)
      if (status === 'succeeded') {
        onPhase?.('succeeded')
        return { generationId, productId, images }
      }
      if (status === 'failed') {
        onPhase?.('failed')
        throw mapped
      }
      await failOwnGeneration(client, generationId, 'Генерация отменена')
      onPhase?.('failed')
      throw mapped
    }

    onPhase?.('failed')
    if (generationId && mapped.code !== 'generation_conflict') {
      await failOwnGeneration(client, generationId, mapped.message)
    }
    throw mapped
  }
}

export function isAlreadyCompletedConflict(error) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  const message = 'message' in error ? String(error.message) : ''
  return code === 'generation_conflict' && /already completed/i.test(message)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} generationId
 */
export async function readGenerationStatus(client, generationId) {
  const { data, error } = await client
    .from('generations')
    .select('status')
    .eq('id', generationId)
    .maybeSingle()
  if (error) {
    throw new GenerationJobError(error.message || 'Не удалось проверить статус генерации', {
      code: 'status_error',
      cause: error,
    })
  }
  return data?.status ?? null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} generationId
 * @param {string} message
 */
export async function failOwnGeneration(client, generationId, message) {
  const { error } = await client.rpc('fail_own_generation', {
    p_generation_id: generationId,
    p_error_message: message,
  })
  if (error) {
    throw mapRpcError(error, 'Не удалось зафиксировать ошибку генерации')
  }
}

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new GenerateCardImageError('Image generation was aborted', {
      code: 'aborted',
      status: 0,
    })
  }
}

/** @param {unknown} error */
function mapJobError(error) {
  if (error instanceof GenerationJobError) return error
  if (error instanceof GenerateCardImageError) {
    if (error.code === 'aborted') {
      return new GenerationJobError('Генерация отменена', { code: 'aborted', cause: error })
    }
    if (error.code === 'unauthorized') {
      return new GenerationJobError('Нужно войти в аккаунт', {
        code: 'unauthorized',
        cause: error,
      })
    }
    if (error.code === 'generation_conflict' || error.code === 'persist_rejected') {
      return new GenerationJobError(error.message, {
        code: error.code,
        cause: error,
      })
    }
    return new GenerationJobError(error.message, { code: error.code, cause: error })
  }
  return mapRpcError(error, 'Не удалось выполнить генерацию')
}

/**
 * @param {unknown} error
 * @param {string} fallback
 */
function mapRpcError(error, fallback) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (message.includes('Insufficient points')) {
    return new GenerationJobError('Недостаточно баллов', {
      code: 'insufficient_points',
      cause: error,
    })
  }
  if (message.includes('Not authenticated')) {
    return new GenerationJobError('Нужно войти в аккаунт', { code: 'unauthorized', cause: error })
  }
  if (message.includes('Product is not classified')) {
    return new GenerationJobError('Сначала выберите категорию товара', {
      code: 'not_classified',
      cause: error,
    })
  }
  if (message.includes('Presentation preset')) {
    return new GenerationJobError('Выберите, как показать товар', {
      code: 'preset_required',
      cause: error,
    })
  }
  return new GenerationJobError(message || fallback, { code: 'rpc_error', cause: error })
}
