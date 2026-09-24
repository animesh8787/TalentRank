import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import type { UploadEvent } from '@/types'

export interface StreamState {
  connected: boolean
  events: Record<number, UploadEvent>
}

/** Split an SSE byte stream into the JSON payloads of its `data:` lines. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data) yield data
    }
  }
}

/**
 * Subscribe to server-sent ingestion progress.
 *
 * Read with fetch rather than EventSource, which cannot send the bearer token
 * the server needs to decide which uploads this user may see. Any drop or
 * clean server-side close re-opens the stream with backoff.
 */
export function useUploadStream(enabled: boolean) {
  const [state, setState] = React.useState<StreamState>({ connected: false, events: {} })
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    let retries = 0
    let timer: number | null = null

    const handle = (event: UploadEvent) => {
      setState((prev) => ({
        connected: true,
        events: { ...prev.events, [event.upload_id]: event },
      }))

      if (event.type === 'upload.completed') {
        if (event.is_duplicate) {
          toast.info(`${event.filename} matched an existing candidate`, {
            description: 'The existing profile was refreshed instead of creating a duplicate.',
          })
        } else {
          toast.success(`${event.candidate_name || event.filename} added`, {
            description:
              event.health_score !== undefined
                ? `Resume health ${Math.round(event.health_score)}/100`
                : undefined,
          })
        }
        // New candidate means new scores across the board.
        queryClient.invalidateQueries({ queryKey: ['candidates'] })
        queryClient.invalidateQueries({ queryKey: ['matches'] })
        queryClient.invalidateQueries({ queryKey: ['jobs'] })
        queryClient.invalidateQueries({ queryKey: ['analytics'] })
        queryClient.invalidateQueries({ queryKey: ['uploads'] })
        queryClient.invalidateQueries({ queryKey: ['my-resume'] })
      } else if (event.status === 'failed') {
        toast.error(`${event.filename} could not be processed`, {
          description: event.error ?? undefined,
        })
        queryClient.invalidateQueries({ queryKey: ['uploads'] })
      }
    }

    const connect = async () => {
      try {
        const body = await api.uploads.stream(controller.signal)
        retries = 0
        setState((prev) => ({ ...prev, connected: true }))
        for await (const data of readEvents(body)) {
          try {
            handle(JSON.parse(data) as UploadEvent)
          } catch {
            /* malformed event — skip it */
          }
        }
      } catch {
        /* network drop, auth failure or abort — handled below */
      }

      setState((prev) => ({ ...prev, connected: false }))
      if (controller.signal.aborted) return
      // Exponential backoff, capped at 30s.
      const delay = Math.min(1000 * 2 ** retries, 30_000)
      retries += 1
      timer = window.setTimeout(() => void connect(), delay)
    }

    void connect()

    return () => {
      controller.abort()
      if (timer) window.clearTimeout(timer)
    }
  }, [enabled, queryClient])

  const clear = React.useCallback(() => {
    setState((prev) => ({ ...prev, events: {} }))
  }, [])

  return { ...state, clear }
}
