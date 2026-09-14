import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { API_BASE } from '@/lib/api'
import type { UploadEvent } from '@/types'

export interface StreamState {
  connected: boolean
  events: Record<number, UploadEvent>
}

/**
 * Subscribe to server-sent ingestion progress.
 *
 * EventSource reconnects on its own, but only for network drops — a server
 * restart closes the stream cleanly, so we re-open manually with backoff.
 */
export function useUploadStream(enabled: boolean) {
  const [state, setState] = React.useState<StreamState>({ connected: false, events: {} })
  const queryClient = useQueryClient()
  const sourceRef = React.useRef<EventSource | null>(null)
  const retryRef = React.useRef(0)
  const timerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!enabled) return

    let disposed = false

    const connect = () => {
      if (disposed) return
      const source = new EventSource(`${API_BASE}/api/uploads/stream`)
      sourceRef.current = source

      source.onopen = () => {
        retryRef.current = 0
        setState((prev) => ({ ...prev, connected: true }))
      }

      source.onmessage = (message) => {
        let event: UploadEvent
        try {
          event = JSON.parse(message.data) as UploadEvent
        } catch {
          return
        }

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
        } else if (event.status === 'failed') {
          toast.error(`${event.filename} could not be processed`, {
            description: event.error ?? undefined,
          })
          queryClient.invalidateQueries({ queryKey: ['uploads'] })
        }
      }

      source.onerror = () => {
        source.close()
        sourceRef.current = null
        setState((prev) => ({ ...prev, connected: false }))
        if (disposed) return
        // Exponential backoff, capped at 30s.
        const delay = Math.min(1000 * 2 ** retryRef.current, 30_000)
        retryRef.current += 1
        timerRef.current = window.setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      disposed = true
      if (timerRef.current) window.clearTimeout(timerRef.current)
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }, [enabled, queryClient])

  const clear = React.useCallback(() => {
    setState((prev) => ({ ...prev, events: {} }))
  }, [])

  return { ...state, clear }
}
