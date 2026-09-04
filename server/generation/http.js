import { Buffer } from 'node:buffer'
import { authenticateRequest } from './auth.js'
import { MAX_REQUEST_BODY_BYTES, MAX_RESPONSE_JSON_BYTES } from './config.js'
import { GenerationError, payloadTooLargeError } from './errors.js'
import { generateCardImage } from './generateCardImage.js'
import {
  failGeneration,
  loadGenerationJob,
  saveGeneratedImage,
  shouldFailGeneration,
  toPersistedImagePayload,
} from './persist.js'

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

const HIDDEN_CLIENT_CODES = new Set(['config_error', 'unauthorized', 'not_found'])

/**
 * @typedef {object} GenerateCardHttpDeps
 * @property {(req: unknown, deps?: object) => Promise<{ id: string, token?: string }>} [authenticate]
 * @property {(user: { id: string }, payload: unknown, deps?: object) => Promise<object>} [loadGenerationJob]
 * @property {(user: { id: string }, job: object, result: object, deps?: object) => Promise<object>} [saveGeneratedImage]
 * @property {(user: { id: string }, generationId: string, message?: string, deps?: object) => Promise<void>} [failGeneration]
 * @property {(input: object, deps?: object) => Promise<object>} [generateCardImage]
 * @property {typeof fetch} [fetch]
 * @property {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {GenerateCardHttpDeps} [deps]
 * @returns {Promise<Response>}
 */
export async function dispatchGenerateCard(req, deps = {}) {
  const method = req.method ?? 'GET'

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { Allow: 'POST, OPTIONS' },
    })
  }

  if (method !== 'POST') {
    return jsonResponse(405, {
      ok: false,
      error: { code: 'method_not_allowed', message: 'Use POST' },
    })
  }

  let user
  try {
    user = await (deps.authenticate ?? authenticateRequest)(req, deps)
  } catch (error) {
    return errorResponse(error)
  }

  let payload
  try {
    payload = await readRequestJson(req)
  } catch (error) {
    if (error instanceof GenerationError) {
      return errorResponse(error)
    }
    return jsonResponse(400, {
      ok: false,
      error: {
        code: 'validation_error',
        message: error instanceof Error ? error.message : 'Invalid JSON body',
      },
    })
  }

  let job
  try {
    job = await (deps.loadGenerationJob ?? loadGenerationJob)(user, payload, deps)
  } catch (error) {
    return errorResponse(error)
  }

  if (job.cached) {
    return jsonResponse(200, {
      ok: true,
      model: 'cached',
      prompt: '',
      image: {
        mediaType: job.mediaType || 'image/png',
        base64: null,
        url: job.signedUrl,
      },
      usage: null,
      generation: {
        id: job.generationId,
        status: job.status,
        storagePath: job.storagePath,
        sortOrder: job.sortOrder,
      },
    })
  }

  const generate = deps.generateCardImage ?? generateCardImage
  let persistResult = {}

  try {
    const wishes = job.wishes ?? undefined
    const presentationPrompt = job.presentationPrompt ?? undefined
    const result = await generate(
      {
        generationType: job.generationType,
        wishes,
        presentationPrompt,
        prompt:
          wishes || presentationPrompt
            ? undefined
            : 'Commercial product photo from the reference image',
        sourceImage: { url: job.sourceImageUrl },
      },
      { fetch: deps.fetch, env: deps.env },
    )

    persistResult = await (deps.saveGeneratedImage ?? saveGeneratedImage)(
      user,
      job,
      result,
      deps,
    )

    return jsonResponse(200, {
      ...toPersistedImagePayload(result, persistResult.signedUrl),
      generation: {
        id: job.generationId,
        status: persistResult.status,
        storagePath: persistResult.storagePath,
        sortOrder: persistResult.sortOrder,
      },
    })
  } catch (error) {
    if (shouldFailGeneration(error, persistResult)) {
      await (deps.failGeneration ?? failGeneration)(
        user,
        job.generationId,
        error instanceof Error ? error.message : 'Image generation failed',
        deps,
      ).catch(() => {})
    }
    return errorResponse(error)
  }
}

/** @param {unknown} error */
export function errorResponse(error) {
  if (error instanceof GenerationError) {
    if (error.code === 'auth_required') {
      return jsonResponse(401, {
        ok: false,
        error: { code: 'unauthorized', message: error.message },
      })
    }
    if (HIDDEN_CLIENT_CODES.has(error.code)) {
      console.error('[generation]', error.code, error.message, error.cause ?? '')
      return jsonResponse(error.status, {
        ok: false,
        error: { code: 'upstream_error', message: 'Image generation failed' },
      })
    }
    return jsonResponse(error.status, {
      ok: false,
      error: { code: error.code, message: error.message },
    })
  }

  console.error('[generation] unexpected', error)
  return jsonResponse(500, {
    ok: false,
    error: { code: 'internal_error', message: 'Image generation failed' },
  })
}

/**
 * @param {number} status
 * @param {unknown} body
 */
export function jsonResponse(status, body) {
  let payloadStatus = status
  let serialized = JSON.stringify(body)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESPONSE_JSON_BYTES) {
    payloadStatus = 413
    serialized = JSON.stringify({
      ok: false,
      error: {
        code: 'payload_too_large',
        message: 'Generated image is too large to return over this endpoint',
      },
    })
  }
  return new Response(serialized, {
    status: payloadStatus,
    headers: JSON_HEADERS,
  })
}

/**
 * @param {import('node:http').IncomingMessage & { body?: unknown }} req
 */
export async function readRequestJson(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    assertPayloadSize(Buffer.byteLength(JSON.stringify(req.body), 'utf8'))
    return req.body
  }

  const raw =
    typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : await readRawBody(req)

  assertPayloadSize(Buffer.byteLength(raw, 'utf8'))

  if (!raw.trim()) {
    throw new Error('Request body is required')
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('Request body must be valid JSON')
  }
}

/** @param {number} bytes */
function assertPayloadSize(bytes) {
  if (bytes > MAX_REQUEST_BODY_BYTES) {
    throw payloadTooLargeError('Request body is too large')
  }
}

/** @param {import('node:http').IncomingMessage} req */
async function readRawBody(req) {
  const headerLength = Number.parseInt(
    String(req.headers?.['content-length'] ?? req.headers?.['Content-Length'] ?? ''),
    10,
  )
  if (Number.isFinite(headerLength) && headerLength > MAX_REQUEST_BODY_BYTES) {
    req.destroy?.()
    throw payloadTooLargeError('Request body is too large')
  }

  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buf.length
    if (size > MAX_REQUEST_BODY_BYTES) {
      req.destroy?.()
      throw payloadTooLargeError('Request body is too large')
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {GenerateCardHttpDeps} [deps]
 */
export async function writeNodeResponse(req, res, deps) {
  const response = await dispatchGenerateCard(req, deps)
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.end(await response.text())
}
