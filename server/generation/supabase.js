import { createClient } from '@supabase/supabase-js'
import { configError } from './errors.js'

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function loadSupabaseEnv(env = process.env) {
  const url = env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim() || ''
  const anonKey = env.SUPABASE_ANON_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim() || ''
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  return { url, anonKey, serviceRoleKey }
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function createUserAuthClient(env = process.env) {
  const { url, anonKey } = loadSupabaseEnv(env)
  if (!url || !anonKey) {
    throw configError('Supabase URL or anon key is not configured')
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function createServiceClient(env = process.env) {
  const { url, serviceRoleKey } = loadSupabaseEnv(env)
  if (!url || !serviceRoleKey) {
    throw configError('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
