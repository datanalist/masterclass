/**
 * @typedef {object} PromptInput
 * @property {'photo' | 'card'} [generationType]
 * @property {string} [prompt]
 * @property {string} [wishes]
 * @property {string} [presentationPrompt]
 */

/**
 * Builds an image prompt from generation type, presentation preset, and wishes.
 * @param {PromptInput} input
 */
export function buildImagePrompt(input) {
  const generationType = input.generationType ?? 'card'
  const parts = []

  if (generationType === 'card') {
    parts.push(
      'Create a marketplace product card image.',
      'Photorealistic commercial look, clear product focus, clean composition suitable for an online listing.',
    )
  } else {
    parts.push(
      'Create a commercial product photograph.',
      'Photorealistic catalog quality, keep the product recognizable and well-lit.',
    )
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

/** @param {PromptInput & { sourceImage?: unknown }} input */
function inputHasSourceHint(input) {
  return Boolean(input.sourceImage)
}
