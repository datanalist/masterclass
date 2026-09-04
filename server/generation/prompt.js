import { MAX_DETECTED_LABEL_LENGTH } from './config.js'

/**
 * @typedef {object} PromptInput
 * @property {'photo' | 'card'} [generationType]
 * @property {string} [prompt]
 * @property {string} [wishes]
 * @property {string} [presentationPrompt]
 * @property {string | null} [detectedLabel]
 */

/**
 * Builds an image prompt. Marketplace cards get a key-subject clause when a
 * detected label is present; photo jobs keep the catalog framing.
 * @param {PromptInput} input
 */
export function buildImagePrompt(input) {
  const generationType = input.generationType ?? 'card'
  const keySubject = sanitizeDetectedLabel(input.detectedLabel)
  const parts = []

  if (generationType === 'card') {
    parts.push(
      'Create a marketplace product card image.',
      'Photorealistic commercial look, clear product focus, clean composition suitable for an online listing.',
    )
    if (keySubject) {
      parts.push(
        `Key subject: ${keySubject}.`,
        'Build the card around this specific item, not the whole scene or background clutter.',
      )
    }
  } else {
    parts.push(
      'Create a commercial product photograph.',
      'Photorealistic catalog quality, keep the product recognizable and well-lit.',
    )
    if (keySubject) {
      parts.push(`Keep this product recognizable: ${keySubject}.`)
    }
  }

  if (input.presentationPrompt) {
    parts.push(`Presentation: ${input.presentationPrompt}`)
  }
  if (input.wishes) {
    parts.push(`Additional wishes: ${input.wishes}`)
  }
  if (input.prompt) {
    parts.push(input.prompt)
  }

  if (inputHasSourceHint(input)) {
    parts.push('Use the attached reference photo as the product source and keep it recognizable.')
  }

  return parts.join(' ')
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const ALLOWED_LABEL_RE = /^[\p{L}\p{N}]+(?:[ -][\p{L}\p{N}]+)*$/u
const INJECTION_LABEL_RE = /ignore\s+previous/i

export function sanitizeDetectedLabel(value) {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_DETECTED_LABEL_LENGTH) return null
  if (INJECTION_LABEL_RE.test(trimmed)) return null
  if (trimmed.includes(':')) return null
  if (!ALLOWED_LABEL_RE.test(trimmed)) return null
  return trimmed
}

/** @param {PromptInput & { sourceImage?: unknown }} input */
function inputHasSourceHint(input) {
  return Boolean(input.sourceImage)
}
