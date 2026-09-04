import {
  ALLOWED_ASPECT_RATIOS,
  ALLOWED_RESOLUTIONS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_RESOLUTION,
  GENERATION_TYPES,
  MAX_PRESENTATION_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_SOURCE_IMAGE_CHARS,
  MAX_WISHES_LENGTH,
  loadGenerationConfig,
} from './config.js'
import { GenerationError, validationError } from './errors.js'
import { buildImagePrompt, sanitizeDetectedLabel } from './prompt.js'

/**
 * @typedef {object} SourceImageInput
 * @property {string} [url]
 * @property {string} [base64]
 * @property {string} [mediaType]
 */

/**
 * @typedef {object} GenerateCardImageInput
 * @property {'photo' | 'card'} [generationType]
 * @property {string} [prompt]
 * @property {string} [wishes]
 * @property {string} [presentationPrompt]
 * @property {string | null} [detectedLabel]
 * @property {SourceImageInput} [sourceImage]
 * @property {string} [aspectRatio]
 * @property {string} [resolution]
 */

/**
 * @typedef {object} GeneratedImage
 * @property {string | null} base64
 * @property {string} mediaType
 * @property {string | null} url
 */

/**
 * @typedef {object} GenerateCardImageResult
 * @property {true} ok
 * @property {string} model
 * @property {string} prompt
 * @property {GeneratedImage} image
 * @property {{ promptTokens: number, completionTokens: number, totalTokens: number, cost: number | null } | null} usage
 */

/**
 * @typedef {object} GenerateCardImageDeps
 * @property {typeof fetch} [fetch]
 * @property {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */

/**
 * @param {GenerateCardImageInput} input
 * @param {GenerateCardImageDeps} [deps]
 * @returns {Promise<GenerateCardImageResult>}
 */
export async function generateCardImage(input, deps = {}) {
  const request = normalizeInput(input)
  const config = loadGenerationConfig(deps.env)
  const fetchImpl = deps.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new GenerationError('fetch is not available', {
      code: 'config_error',
      status: 500,
    })
  }

  const prompt = buildImagePrompt(request)
  const payload = {
    model: config.model,
    prompt,
    n: 1,
    aspect_ratio: request.aspectRatio,
    resolution: request.resolution,
  }

  if (request.sourceImageUrl) {
    payload.input_references = [
      {
        type: 'image_url',
        image_url: { url: request.sourceImageUrl },
      },
    ]
  }

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (config.httpReferer) headers['HTTP-Referer'] = config.httpReferer
  if (config.appTitle) headers['X-Title'] = config.appTitle

  let response
  try {
    response = await fetchImpl(`${config.baseUrl}/images`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (error) {
    throw mapFetchError(error)
  }

  const body = await readJson(response)

  if (!response.ok) {
    throw mapOpenRouterError(body, response.status)
  }

  const images = normalizeImages(body)
  if (images.length === 0) {
    throw new GenerationError('OpenRouter returned no image', {
      code: 'upstream_error',
      status: 502,
    })
  }

  return {
    ok: true,
    model: config.model,
    prompt,
    image: images[0],
    usage: normalizeUsage(body?.usage),
  }
}

/**
 * @param {GenerateCardImageInput} input
 */
export function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('Request body must be a JSON object')
  }

  const generationType = input.generationType ?? 'card'
  if (!GENERATION_TYPES.includes(generationType)) {
    throw validationError('generationType must be "photo" or "card"')
  }

  const prompt = optionalString(input.prompt, 'prompt', MAX_PROMPT_LENGTH)
  const wishes = optionalString(input.wishes, 'wishes', MAX_WISHES_LENGTH)
  const presentationPrompt = optionalString(
    input.presentationPrompt,
    'presentationPrompt',
    MAX_PRESENTATION_LENGTH,
  )
  const detectedLabel = sanitizeDetectedLabel(input.detectedLabel) ?? undefined

  if (!prompt && !wishes && !presentationPrompt) {
    throw validationError('Provide prompt, wishes, or presentationPrompt')
  }

  const aspectRatio = optionalEnum(
    input.aspectRatio,
    'aspectRatio',
    ALLOWED_ASPECT_RATIOS,
    DEFAULT_ASPECT_RATIO,
  )
  const resolution = optionalEnum(
    input.resolution,
    'resolution',
    ALLOWED_RESOLUTIONS,
    DEFAULT_RESOLUTION,
  )
  return {
    generationType,
    prompt,
    wishes,
    presentationPrompt,
    detectedLabel,
    aspectRatio,
    resolution,
    sourceImageUrl: normalizeSourceImage(input.sourceImage),
    sourceImage: input.sourceImage ?? null,
  }
}

/** @param {SourceImageInput | undefined} sourceImage */
function normalizeSourceImage(sourceImage) {
  if (sourceImage == null) return null
  if (typeof sourceImage !== 'object' || Array.isArray(sourceImage)) {
    throw validationError('sourceImage must be an object')
  }

  const url = typeof sourceImage.url === 'string' ? sourceImage.url.trim() : ''
  const base64 = typeof sourceImage.base64 === 'string' ? sourceImage.base64.trim() : ''
  const mediaType =
    typeof sourceImage.mediaType === 'string' && sourceImage.mediaType.trim()
      ? sourceImage.mediaType.trim()
      : 'image/png'

  if (url && base64) {
    throw validationError('sourceImage must use either url or base64, not both')
  }
  if (!url && !base64) {
    throw validationError('sourceImage requires url or base64')
  }

  if (url) {
    if (url.length > MAX_SOURCE_IMAGE_CHARS) {
      throw validationError('sourceImage.url is too large')
    }
    if (url.startsWith('data:image/')) return rewriteDataUrlMediaType(url)
    if (/^https:\/\//i.test(url)) return url
    throw validationError('sourceImage.url must be an https or data:image URL')
  }

  if (base64.length > MAX_SOURCE_IMAGE_CHARS) {
    throw validationError('sourceImage.base64 is too large')
  }
  if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(mediaType)) {
    throw validationError('sourceImage.mediaType must be a supported image type')
  }

  const raw = base64.replace(/^data:[^;]+;base64,/, '')
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) {
    throw validationError('sourceImage.base64 is not valid base64')
  }

  return `data:${normalizeMediaType(mediaType)};base64,${raw.replace(/\s+/g, '')}`
}

/** @param {unknown} mediaType */
export function normalizeMediaType(mediaType) {
  const value =
    typeof mediaType === 'string' && mediaType.trim() ? mediaType.trim().toLowerCase() : 'image/png'
  return value === 'image/jpg' ? 'image/jpeg' : value
}

/** @param {string} url */
function rewriteDataUrlMediaType(url) {
  return url.replace(/^data:image\/jpg;/i, 'data:image/jpeg;')
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {number} maxLength
 */
function optionalString(value, field, maxLength) {
  if (value == null) return undefined
  if (typeof value !== 'string') {
    throw validationError(`${field} must be a string`)
  }
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > maxLength) {
    throw validationError(`${field} is too long`)
  }
  return trimmed
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {string[]} allowed
 * @param {string} fallback
 */
function optionalEnum(value, field, allowed, fallback) {
  if (value == null || value === '') return fallback
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw validationError(`${field} must be one of: ${allowed.join(', ')}`)
  }
  return value
}

/** @param {unknown} error */
function mapFetchError(error) {
  const name = error && typeof error === 'object' ? error.name : ''
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new GenerationError('OpenRouter image generation timed out', {
      code: 'timeout',
      status: 504,
      cause: error,
    })
  }
  return new GenerationError('Failed to reach OpenRouter', {
    code: 'network_error',
    status: 502,
    cause: error,
  })
}

/** @param {unknown} body @param {number} status */
export function mapOpenRouterError(body, status) {
  const mapped = mapStatusCode(status)
  const message = extractOpenRouterMessage(body)

  if (status === 401 || status === 404) {
    console.error(`[generation] OpenRouter ${status}:`, message)
    return new GenerationError('Image generation failed', {
      code: 'upstream_error',
      status: 502,
    })
  }

  return new GenerationError(message, {
    code: mapped.code,
    status: mapped.status,
  })
}

/** @param {unknown} body */
function extractOpenRouterMessage(body) {
  const err = body && typeof body === 'object' ? body.error : null
  if (typeof err === 'string' && err) return err
  if (err && typeof err === 'object' && typeof err.message === 'string' && err.message) {
    return err.message
  }
  if (body && typeof body === 'object' && typeof body.message === 'string' && body.message) {
    return body.message
  }
  return 'OpenRouter image generation failed'
}

/** @param {number} status */
function mapStatusCode(status) {
  if (status === 400) return { code: 'validation_error', status: 400 }
  if (status === 401) return { code: 'unauthorized', status: 502 }
  if (status === 402) return { code: 'payment_required', status: 402 }
  if (status === 403) return { code: 'forbidden', status: 403 }
  if (status === 404) return { code: 'not_found', status: 502 }
  if (status === 413) return { code: 'payload_too_large', status: 413 }
  if (status === 429) return { code: 'rate_limited', status: 429 }
  if (status === 502) return { code: 'upstream_error', status: 502 }
  return { code: 'upstream_error', status: status >= 400 && status < 600 ? status : 502 }
}

/** @param {Response} response */
async function readJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new GenerationError('OpenRouter returned a non-JSON response', {
      code: 'upstream_error',
      status: 502,
    })
  }
}

/** @param {any} body */
function normalizeImages(body) {
  const rows = Array.isArray(body?.data) ? body.data : []
  /** @type {GeneratedImage[]} */
  const images = []

  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    const base64 = typeof item.b64_json === 'string' && item.b64_json ? item.b64_json : null
    const url = typeof item.url === 'string' && item.url ? item.url : null
    const mediaType = normalizeMediaType(
      typeof item.media_type === 'string' && item.media_type ? item.media_type : 'image/png',
    )
    if (!base64 && !url) continue
    images.push({
      base64,
      mediaType,
      url,
    })
  }

  return images
}

/** @param {any} usage */
function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  return {
    promptTokens: Number(usage.prompt_tokens) || 0,
    completionTokens: Number(usage.completion_tokens) || 0,
    totalTokens: Number(usage.total_tokens) || 0,
    cost: typeof usage.cost === 'number' ? usage.cost : null,
  }
}
