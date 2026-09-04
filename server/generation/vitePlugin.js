import { writeDetectNodeResponse } from './detectHttp.js'
import { writeNodeResponse } from './http.js'

const GENERATE_PATH = '/api/generate-card'
const DETECT_PATH = '/api/detect-subject'

/**
 * Serves the generation endpoint during `vite` / `vite preview`
 * so the OpenRouter key stays on the server.
 * @param {Record<string, string>} env
 */
export function generationApiPlugin(env) {
  return {
    name: 'generation-api',
    configureServer(server) {
      applyOpenRouterEnv(env)
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server) {
      applyOpenRouterEnv(env)
      server.middlewares.use(createMiddleware())
    },
  }
}

/** @param {Record<string, string>} env */
function applyOpenRouterEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    if (
      value &&
      !process.env[key] &&
      (key.startsWith('OPENROUTER_') ||
        key.startsWith('SUPABASE_') ||
        key.startsWith('VITE_SUPABASE_'))
    ) {
      process.env[key] = value
    }
  }
}

function createMiddleware() {
  return (req, res, next) => {
    const path = req.url?.split('?')[0]?.replace(/\/$/, '')
    const write =
      path === GENERATE_PATH
        ? writeNodeResponse
        : path === DETECT_PATH
          ? writeDetectNodeResponse
          : null
    if (!write) {
      next()
      return
    }

    write(req, res).catch((error) => {
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'internal_error', message: 'Image generation failed' },
          }),
        )
      }
      console.error(error)
    })
  }
}
