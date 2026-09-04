/**
 * @typedef {'photo' | 'card'} GenerationType
 * @typedef {'512' | '1K' | '2K' | '4K'} ImageResolution
 *
 * @typedef {object} SourceImageInput
 * @property {string} [url]
 * @property {string} [base64]
 * @property {string} [mediaType]
 *
 * @typedef {object} GenerateCardImageInput
 * @property {string} [generationId]
 * @property {number} [sortOrder]
 * @property {GenerationType} [generationType]
 * @property {string} [prompt]
 * @property {string} [wishes]
 * @property {string} [presentationPrompt]
 * @property {SourceImageInput} [sourceImage]
 * @property {string} [aspectRatio]
 * @property {ImageResolution} [resolution]
 *
 * @typedef {object} GeneratedImage
 * @property {string | null} base64
 * @property {string} mediaType
 * @property {string | null} url
 * @property {string | null} dataUrl
 *
 * @typedef {object} GenerateCardImageResult
 * @property {true} ok
 * @property {string} model
 * @property {string} prompt
 * @property {GeneratedImage} image
 * @property {{ promptTokens: number, completionTokens: number, totalTokens: number, cost: number | null } | null} usage
 *
 * @typedef {object} GenerateCardImageErrorPayload
 * @property {false} ok
 * @property {{ code: string, message: string }} error
 */

export class GenerateCardImageError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number }} [options]
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'GenerateCardImageError'
    this.code = options.code ?? 'generation_error'
    this.status = options.status ?? 500
  }
}

/**
 * Browser/client call to the server-side OpenRouter endpoint.
 * The OpenRouter key never leaves the server.
 *
 * Compress or resize `sourceImage` before sending: the function payload is
 * capped around 4.5 MB on Vercel, and this client/server pair rejects bodies
 * near 4 MB.
 *
 * @param {GenerateCardImageInput} input
 * @param {{ endpoint?: string, signal?: AbortSignal, headers?: Record<string, string> }} [options]
 * @returns {Promise<GenerateCardImageResult>}
 */
export async function generateCardImage(input, options = {}) {
  let response
  try {
    response = await fetch(options.endpoint ?? '/api/generate-card', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(input),
      signal: options.signal,
    })
  } catch (error) {
    throw mapClientFetchError(error)
  }

  let payload
  try {
    payload = await response.json()
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      throw mapClientFetchError(error)
    }
    throw new GenerateCardImageError(
      response.status === 413
        ? 'Generated image is too large to return over this endpoint'
        : 'Image generation failed',
      {
        code: response.status === 413 ? 'payload_too_large' : 'upstream_error',
        status: response.status,
      },
    )
  }

  if (!response.ok || !payload?.ok) {
    throw new GenerateCardImageError(
      payload?.error?.message || 'Image generation failed',
      {
        code: payload?.error?.code || 'upstream_error',
        status: response.status,
      },
    )
  }

  return withClientDataUrl(payload)
}

/** @param {unknown} error */
function mapClientFetchError(error) {
  if (isAbortError(error)) {
    return new GenerateCardImageError('Image generation was aborted', {
      code: 'aborted',
      status: 0,
    })
  }
  return new GenerateCardImageError('Failed to reach image generation', {
    code: 'network_error',
    status: 0,
  })
}

/** @param {unknown} error */
function isAbortError(error) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'AbortError',
  )
}

/**
 * Server JSON carries bytes once (`base64`). The data URL is assembled here.
 * @param {GenerateCardImageResult} payload
 * @returns {GenerateCardImageResult}
 */
function withClientDataUrl(payload) {
  const image = payload?.image
  if (!image || typeof image !== 'object') return payload
  const mediaType = normalizeClientMediaType(image.mediaType)
  const base64 = typeof image.base64 === 'string' && image.base64 ? image.base64 : null
  return {
    ...payload,
    image: {
      mediaType,
      base64,
      url: image.url ?? null,
      dataUrl: base64 ? `data:${mediaType};base64,${base64}` : null,
    },
  }
}

/** @param {unknown} mediaType */
function normalizeClientMediaType(mediaType) {
  const value =
    typeof mediaType === 'string' && mediaType.trim() ? mediaType.trim().toLowerCase() : 'image/png'
  return value === 'image/jpg' ? 'image/jpeg' : value
}
