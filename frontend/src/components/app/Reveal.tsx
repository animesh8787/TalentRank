import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Fades an element up into place the first time it enters the viewport.
 *
 * Content already on screen at mount is shown immediately via a synchronous
 * getBoundingClientRect() check, rather than waiting on the
 * IntersectionObserver's first (asynchronous) callback. Waiting on the
 * observer alone raced with React StrictMode's mount→cleanup→mount cycle in
 * development: the first observer got disconnected before its callback ever
 * fired, and the section stayed invisible until the next scroll re-triggered
 * it — exactly wrong for above-the-fold hero content, which must never
 * depend on a user scrolling to become visible.
 *
 * prefers-reduced-motion is already handled globally in index.css (it zeroes
 * every animation-duration site-wide), so this component doesn't special-case it.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const node = ref.current
    if (!node) return

    // Already on screen (or above it) at mount — reveal immediately rather
    // than waiting on the observer's first async tick.
    const rect = node.getBoundingClientRect()
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    if (rect.top < viewportHeight * 0.9 && rect.bottom > 0) {
      setVisible(true)
      return
    }

    // A generous positive rootMargin and a 0 threshold trade precise reveal
    // timing for robustness: the trigger zone starts 200px before the
    // viewport on every side, so even a fast scroll (or a programmatic jump)
    // is very unlikely to skip past an element without the observer ever
    // getting a frame where it counts as intersecting.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
