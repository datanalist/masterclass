import { useCallback, useEffect, useRef, useState } from 'react'
import { generateCardImage } from './generateCardImage.js'

/**
 * Hook for a single OpenRouter image call.
 * Persistence and charging live in `useRunGeneration`.
 */
export function useGenerateCardImage() {
  const [status, setStatus] = useState('idle')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const generationIdRef = useRef(0)
  const abortRef = useRef(null)

  useEffect(() => {
    return () => {
      generationIdRef.current += 1
      abortRef.current?.abort()
    }
  }, [])

  const generate = useCallback(async (input, options = {}) => {
    const generationId = ++generationIdRef.current
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller
    const signal = combineSignals(options.signal, controller.signal)

    setStatus('loading')
    setError(null)
    try {
      const result = await generateCardImage(input, { ...options, signal })
      if (generationId !== generationIdRef.current) return result
      setData(result)
      setStatus('success')
      return result
    } catch (err) {
      if (generationId !== generationIdRef.current) throw err
      setError(err)
      setStatus('error')
      throw err
    }
  }, [])

  const reset = useCallback(() => {
    generationIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    setData(null)
    setError(null)
  }, [])

  return { status, data, error, generate, reset }
}

/** @param {AbortSignal | undefined} external @param {AbortSignal} internal */
function combineSignals(external, internal) {
  if (!external) return internal
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([external, internal])
  }
  if (external.aborted) return external
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  external.addEventListener('abort', onAbort, { once: true })
  internal.addEventListener('abort', onAbort, { once: true })
  return controller.signal
}
