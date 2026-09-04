import { GenerationError } from './errors.js'
import { createUserAuthClient } from './supabase.js'

/**
 * @param {{ headers?: Record<string, unknown> }} req
 * @returns {string | null}
 */
export function getBearerToken(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization
  if (typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(\S+)/i)
  return match ? match[1] : null
}

/**
 * @param {{ headers?: Record<string, unknown> }} req
 * @param {{ env?: NodeJS.ProcessEnv | Record<string, string | undefined>, authClient?: { auth: { getUser: Function } } }} [deps]
 * @returns {Promise<{ id: string, email: string | null, token: string }>}
 */
export async function authenticateRequest(req, deps = {}) {
  const token = getBearerToken(req)
  if (!token) {
    throw new GenerationError('Sign in required', {
      code: 'auth_required',
      status: 401,
    })
  }

  const client = deps.authClient ?? createUserAuthClient(deps.env)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user?.id) {
    throw new GenerationError('Sign in required', {
      code: 'auth_required',
      status: 401,
    })
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    token,
  }
}
