import { useCallback, useEffect, useMemo, useRef } from 'react'

type Opts = {
  onChunk: (base64: string) => void
  onError?: (err: unknown) => void
}

// Mic stream + AudioContext + ScriptProcessor. setup() is idempotent.
// Downsamples whatever the device's native rate is to 16 kHz int16 PCM.
export function useMicCapture({ onChunk, onError }: Opts) {
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const setupRef = useRef(false)
  const onChunkRef = useRef(onChunk)
  const onErrorRef = useRef(onError)
  useEffect(() => { onChunkRef.current = onChunk }, [onChunk])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const setup = useCallback(async () => {
    if (setupRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      ctxRef.current = ctx
      streamRef.current = stream
      const nativeSR = ctx.sampleRate
      console.log('[mic] AudioContext sampleRate:', nativeSR)
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        try {
          const inputData = e.inputBuffer.getChannelData(0)
          const ratio = nativeSR / 16000
          const outLen = Math.floor(inputData.length / ratio)
          const int16 = new Int16Array(outLen)
          for (let i = 0; i < outLen; i++) {
            const sample = inputData[Math.floor(i * ratio)]
            int16[i] = Math.max(-32768, Math.min(32767, sample * 32768))
          }
          // Chunk-wise base64 encode to avoid spreading thousands of bytes onto the call stack.
          const u8 = new Uint8Array(int16.buffer)
          let binary = ''
          const CHUNK = 0x8000
          for (let i = 0; i < u8.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[])
          }
          onChunkRef.current(btoa(binary))
        } catch {
          // session closed mid-frame — ignore
        }
      }

      source.connect(processor)
      processor.connect(ctx.destination)
      setupRef.current = true
    } catch (err) {
      setupRef.current = false
      const e = err as { name?: string; message?: string }
      console.error('[mic] init failed:', e?.name ?? String(err), e?.message ?? '')
      onErrorRef.current?.(err)
      throw err
    }
  }, [])

  const resume = useCallback(() => { void ctxRef.current?.resume?.() }, [])

  const teardown = useCallback(() => {
    try { processorRef.current?.disconnect() } catch { /* not connected */ }
    processorRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close?.()
    ctxRef.current = null
    setupRef.current = false
  }, [])

  return useMemo(() => ({ setup, resume, teardown }), [setup, resume, teardown])
}
