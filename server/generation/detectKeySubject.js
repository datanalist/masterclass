import { loadDetectConfig, MAX_DETECTED_LABEL_LENGTH } from './config.js'
import { sanitizeDetectedLabel } from './prompt.js'

const DETECT_INSTRUCTION = [
  'Identify the single key product a marketplace listing should sell from this photo.',
  'Name the sellable item, not the scene, person, furniture, or background.',
  'Reply with JSON only: {"label":"<short noun phrase>"}',
  `The label must be at most ${MAX_DETECTED_LABEL_LENGTH} characters.`,
  'If no product is visible, reply {"label":null}.',
].join(' ')

/**
 * @typedef {object} DetectKeySubjectResult
 * @property {string | null} detectedLabel
 * @property {boolean} fallback
 * @property {string} [reason]
 * @property {string} [model]
 */

/**
 * @param {{ sourceImageUrl: string, categoryTitle?: string | null }} input
 * @param {{ fetch?: typeof fetch, env?: NodeJS.ProcessEnv | Record<string, string | undefined> }} [deps]
 * @returns {Promise<DetectKeySubjectResult>}
 */
export async function detectKeySubject(input, deps = {}) {
  const sourceImageUrl = typeof input?.sourceImageUrl === 'string' ? input.sourceImageUrl.trim() : ''
  if (!sourceImageUrl) {
    return fallbackResult('missing_source')
  }

  let config
  try {
    config = loadDetectConfig(deps.env)
  } catch (error) {
    console.warn('[generation] key-subject detect config fallback', error?.message ?? error)
    return fallbackResult('config')
  }

  const fetchImpl = deps.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    return fallbackResult('config')
  }

  const text = [DETECT_INSTRUCTION]
  if (input.categoryTitle) {
    text.push(`Seller category (do not override): ${input.categoryTitle}.`)
  }

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (config.httpReferer) headers['HTTP-Referer'] = config.httpReferer
  if (config.appTitle) headers['X-Title'] = config.appTitle

  let response
  try {
    response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 80,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: text.join(' ') },
              { type: 'image_url', image_url: { url: sourceImageUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (error) {
    const name = error && typeof error === 'object' ? error.name : ''
    const reason = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network'
    console.warn('[generation] key-subject detect fallback:', reason, error?.message ?? error)
    return fallbackResult(reason, config.model)
  }

  let body
  try {
    body = await response.json()
  } catch {
    console.warn('[generation] key-subject detect fallback: invalid_json')
    return fallbackResult('invalid_json', config.model)
  }

  if (!response.ok) {
    console.warn('[generation] key-subject detect fallback: upstream', response.status)
    return fallbackResult('upstream', config.model)
  }

  const parsed = parseDetectContent(extractMessageContent(body))
  return {
    detectedLabel: parsed.detectedLabel,
    fallback: parsed.detectedLabel == null,
    reason: parsed.detectedLabel ? undefined : parsed.reason ?? 'empty_label',
    model: config.model,
  }
}

/**
 * @param {unknown} body
 * @returns {string}
 */
export function extractMessageContent(body) {
  const message = body && typeof body === 'object' ? body.choices?.[0]?.message : null
  const content = message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && typeof part.text === 'string') return part.text
        return ''
      })
      .join('')
  }
  return ''
}

/**
 * @param {unknown} raw
 * @returns {{ detectedLabel: string | null, reason?: string }}
 */
export function parseDetectContent(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { detectedLabel: null, reason: 'empty_label' }
  }

  const jsonPayload = extractJsonObject(raw.trim())
  if (!jsonPayload || !Object.hasOwn(jsonPayload, 'label')) {
    return { detectedLabel: null, reason: 'empty_label' }
  }

  const label = sanitizeDetectedLabel(jsonPayload.label)
  if (label) return { detectedLabel: label }
  return { detectedLabel: null, reason: 'empty_label' }
}

/** @param {string} text */
function extractJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** @param {string} reason @param {string} [model] */
function fallbackResult(reason, model) {
  return { detectedLabel: null, fallback: true, reason, model }
}
