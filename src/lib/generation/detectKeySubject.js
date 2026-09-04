import { sanitizeDetectedLabel } from '../../../server/generation/prompt.js'
import { GenerateCardImageError } from './generateCardImage.js'

/**
 * @param {{ productId: string, categoryId?: string }} input
 * @param {{ endpoint?: string, signal?: AbortSignal, headers?: Record<string, string> }} [options]
 * @returns {Promise<{ detectedLabel: string | null, fallback: boolean, reason?: string }>}
 */
export async function detectKeySubject(input, options = {}) {
  let response
  try {
    response = await fetch(options.endpoint ?? '/api/detect-subject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify({
        productId: input.productId,
        categoryId: input.categoryId ?? null,
      }),
      signal: options.signal,
    })
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      throw new GenerateCardImageError('Image generation was aborted', {
        code: 'aborted',
        status: 0,
      })
    }
    console.warn('[generation] key-subject detect fallback: network')
    return { detectedLabel: null, fallback: true, reason: 'network' }
  }

  let payload
  try {
    payload = await response.json()
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      throw new GenerateCardImageError('Image generation was aborted', {
        code: 'aborted',
        status: 0,
      })
    }
    console.warn('[generation] key-subject detect fallback: invalid_json')
    return { detectedLabel: null, fallback: true, reason: 'invalid_json' }
  }

  if (response.status === 401) {
    throw new GenerateCardImageError(payload?.error?.message || 'Нужно войти в аккаунт', {
      code: 'unauthorized',
      status: 401,
    })
  }

  if (!response.ok || !payload?.ok) {
    console.warn('[generation] key-subject detect fallback:', payload?.error?.code || response.status)
    return { detectedLabel: null, fallback: true, reason: payload?.error?.code || 'http' }
  }

  const detectedLabel = sanitizeDetectedLabel(payload.detectedLabel)

  return {
    detectedLabel,
    fallback: Boolean(payload.fallback || !detectedLabel),
    reason: detectedLabel ? undefined : payload.reason ?? 'empty_label',
  }
}

/** @param {unknown} error */
function isAbortError(error) {
  return Boolean(
    error && typeof error === 'object' && 'name' in error && error.name === 'AbortError',
  )
}
