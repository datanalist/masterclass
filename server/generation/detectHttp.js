import { authenticateRequest } from './auth.js'
import { detectKeySubject } from './detectKeySubject.js'
import { GenerationError } from './errors.js'
import { errorResponse, jsonResponse, readRequestJson } from './http.js'
import { loadProductSource } from './persist.js'

/**
 * @typedef {object} DetectSubjectHttpDeps
 * @property {(req: unknown, deps?: object) => Promise<{ id: string }>} [authenticate]
 * @property {(user: { id: string }, payload: unknown, deps?: object) => Promise<object>} [loadProductSource]
 * @property {(input: object, deps?: object) => Promise<object>} [detectKeySubject]
 * @property {typeof fetch} [fetch]
 * @property {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {DetectSubjectHttpDeps} [deps]
 * @returns {Promise<Response>}
 */
export async function dispatchDetectSubject(req, deps = {}) {
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

  let product
  try {
    product = await (deps.loadProductSource ?? loadProductSource)(user, payload, deps)
  } catch (error) {
    return detectProductLoadError(error)
  }

  try {
    const result = await (deps.detectKeySubject ?? detectKeySubject)(
      {
        sourceImageUrl: product.sourceImageUrl,
        categoryTitle: product.categoryTitle ?? null,
      },
      { fetch: deps.fetch, env: deps.env },
    )

    return jsonResponse(200, {
      ok: true,
      detectedLabel: result.detectedLabel ?? null,
      fallback: Boolean(result.fallback || !result.detectedLabel),
      reason: result.detectedLabel ? undefined : (result.reason ?? 'empty_label'),
    })
  } catch (error) {
    console.warn('[generation] key-subject detect fallback', error)
    return jsonResponse(200, {
      ok: true,
      detectedLabel: null,
      fallback: true,
      reason: 'error',
    })
  }
}

/** Product load/sign failures are errors. 200-fallback is only for vision after a successful load. */
function detectProductLoadError(error) {
  if (error instanceof GenerationError) {
    if (error.code === 'auth_required' || error.code === 'validation_error') {
      return errorResponse(error)
    }
    if (error.code === 'not_found') {
      return jsonResponse(404, {
        ok: false,
        error: { code: 'not_found', message: 'Product not found' },
      })
    }
    if (error.code === 'config_error') {
      return jsonResponse(500, {
        ok: false,
        error: { code: 'config_error', message: 'Detection is not configured' },
      })
    }
    if (error.code === 'upstream_error') {
      return jsonResponse(502, {
        ok: false,
        error: { code: 'upstream_error', message: 'Failed to load product image' },
      })
    }
    return jsonResponse(error.status || 500, {
      ok: false,
      error: { code: error.code, message: error.message },
    })
  }
  console.warn('[generation] key-subject detect product load', error)
  return jsonResponse(500, {
    ok: false,
    error: { code: 'internal_error', message: 'Failed to load product image' },
  })
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {DetectSubjectHttpDeps} [deps]
 */
export async function writeDetectNodeResponse(req, res, deps) {
  const response = await dispatchDetectSubject(req, deps)
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.end(await response.text())
}
