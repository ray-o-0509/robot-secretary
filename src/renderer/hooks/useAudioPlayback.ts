import { useCallback, useMemo, useRef } from 'react'

export function useAudioPlayback() {
  const ctxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])

  const ensureContext = useCallback((): AudioContext => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }, [])

  const enqueuePCM = useCallback(async (base64: string, sampleRate = 24000) => {
    const ctx = ensureContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const int16 = new Int16Array(bytes.buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768

    const buffer = ctx.createBuffer(1, float32.length, sampleRate)
    buffer.copyToChannel(float32, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    // Schedule at max(now, lastQueuedEnd) so consecutive chunks neither overlap nor gap.
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    src.start(startAt)
    nextPlayTimeRef.current = startAt + buffer.duration
    activeSourcesRef.current.push(src)
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src)
    }
  }, [ensureContext])

  const interrupt = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try { src.stop() } catch { /* already stopped */ }
    }
    activeSourcesRef.current = []
    nextPlayTimeRef.current = 0
  }, [])

  const isPlaying = useCallback(() => activeSourcesRef.current.length > 0, [])

  const resume = useCallback(() => { void ctxRef.current?.resume?.() }, [])

  const teardown = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try { src.stop() } catch { /* already stopped */ }
    }
    activeSourcesRef.current = []
    nextPlayTimeRef.current = 0
    void ctxRef.current?.close?.()
    ctxRef.current = null
  }, [])

  return useMemo(
    () => ({ ensureContext, enqueuePCM, interrupt, isPlaying, resume, teardown }),
    [ensureContext, enqueuePCM, interrupt, isPlaying, resume, teardown],
  )
}
