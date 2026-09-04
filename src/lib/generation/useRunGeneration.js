import { useCallback, useEffect, useRef, useState } from 'react'
import { runGenerationJob } from './runGenerationJob.js'

const TERMINAL = new Set(['succeeded', 'failed', 'idle'])

/**
 * Orchestrates feature 2: upload, charge, OpenRouter loop, DB/Storage persist.
 * `run()` throws on abort/error — catch it when closing the modal.
 */
export function useRunGeneration() {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const runIdRef = useRef(0)
  const abortRef = useRef(null)

  useEffect(() => {
    return () => {
      runIdRef.current += 1
      abortRef.current?.abort()
    }
  }, [])

  const run = useCallback(async (input) => {
    const runId = ++runIdRef.current
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller
    const signal = combineSignals(input.signal, controller.signal)

    setStatus('uploading')
    setProgress({ current: 0, total: input.objectCount || 1 })
    setError(null)
    setResult(null)

    try {
      const payload = await runGenerationJob({
        ...input,
        signal,
        onPhase: (phase) => {
          if (runId !== runIdRef.current) return
          setStatus(phase)
        },
        onProgress: (next) => {
          if (runId !== runIdRef.current) return
          setProgress(next)
        },
      })
      if (runId !== runIdRef.current) return payload
      setResult(payload)
      setStatus('succeeded')
      return payload
    } catch (err) {
      if (runId !== runIdRef.current) throw err
      setError(err)
      setStatus('failed')
      throw err
    }
  }, [])

  const reset = useCallback(() => {
    runIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    setProgress(null)
    setError(null)
    setResult(null)
  }, [])

  return { status, progress, error, result, run, reset, isBusy: !TERMINAL.has(status) }
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
