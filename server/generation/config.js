import { configError } from './errors.js'

export const DEFAULT_IMAGE_MODEL = 'google/gemini-3.1-flash-image'
export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_TIMEOUT_MS = 55_000
export const DEFAULT_RESOLUTION = '1K'
export const DEFAULT_ASPECT_RATIO = '1:1'
export const MAX_WISHES_LENGTH = 2000
export const MAX_PROMPT_LENGTH = 4000
export const MAX_PRESENTATION_LENGTH = 500
/** Base64/data-URL cap so the JSON body stays under Vercel ~4.5 MB. */
export const MAX_SOURCE_IMAGE_CHARS = 2_800_000
/** Reject request bodies before the platform HTML 413. */
export const MAX_REQUEST_BODY_BYTES = 4_000_000
/** Reject JSON responses before the platform HTML 413. */
export const MAX_RESPONSE_JSON_BYTES = 4_000_000
export const GENERATION_TYPES = ['photo', 'card']
/** 2K/4K stay allowed; oversized results are rejected as payload_too_large after stringify. */
export const ALLOWED_RESOLUTIONS = ['512', '1K', '2K', '4K']
export const ALLOWED_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
]

/**
 * @typedef {object} GenerationEnv
 * @property {string} apiKey
 * @property {string} baseUrl
 * @property {string} model
 * @property {number} timeoutMs
 * @property {string} [httpReferer]
 * @property {string} [appTitle]
 */

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {GenerationEnv}
 */
export function loadGenerationConfig(env = process.env) {
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw configError('OPENROUTER_API_KEY is not configured')
  }

  const timeoutMs = parseTimeout(env.OPENROUTER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'OPENROUTER_TIMEOUT_MS')
  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '')
  const model = env.OPENROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL

  return {
    apiKey,
    baseUrl,
    model,
    timeoutMs,
    httpReferer: env.OPENROUTER_HTTP_REFERER?.trim() || undefined,
    appTitle: env.OPENROUTER_APP_TITLE?.trim() || 'Master Class',
  }
}

/**
 * @param {string | undefined} value
 * @param {number} fallback
 * @param {string} name
 */
function parseTimeout(value, fallback = DEFAULT_TIMEOUT_MS, name = 'OPENROUTER_TIMEOUT_MS') {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 180_000) {
    throw configError(`${name} must be between 1000 and 180000`)
  }
  return parsed
}
