import * as React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/primitives'

interface State {
  error: Error | null
}

/**
 * Catches render errors so one broken widget cannot blank the whole app.
 * React has no hook equivalent, so this stays a class component.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept as console output rather than shipped anywhere — there is no error
    // reporting service wired up, and silently swallowing it would be worse.
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center shadow-card">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-bold tracking-tight">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              This page hit an unexpected error. Reloading usually clears it.
            </p>
          </div>

          <details className="text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Technical details
            </summary>
            <pre className="scrollbar-thin mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2 text-left text-[11px] leading-relaxed">
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
            </pre>
          </details>

          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw aria-hidden="true" />
              Reload
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
