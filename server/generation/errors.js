export class GenerationError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number, cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'GenerationError'
    this.code = options.code ?? 'generation_error'
    this.status = options.status ?? 500
  }
}

/** @param {string} message */
export function validationError(message) {
  return new GenerationError(message, {
    code: 'validation_error',
    status: 400,
  })
}

/** @param {string} message */
export function configError(message) {
  console.error('[generation] config:', message)
  return new GenerationError('Image generation failed', {
    code: 'config_error',
    status: 500,
  })
}

/** @param {string} [message] */
export function payloadTooLargeError(message = 'Request or response payload is too large') {
  return new GenerationError(message, {
    code: 'payload_too_large',
    status: 413,
  })
}
