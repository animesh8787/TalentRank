import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import App from './App'
import './index.css'
import { AnonymizedProvider, AuthProvider, ThemeProvider } from '@/hooks/providers'
import { ErrorBoundary } from '@/components/app/ErrorBoundary'
import { TooltipProvider } from '@/components/ui/primitives'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry auth/permission failures — they will not fix themselves.
        const status = (error as { status?: number })?.status
        if (status === 401 || status === 403 || status === 404) return false
        return failureCount < 2
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AnonymizedProvider>
            <TooltipProvider delayDuration={200}>
              <BrowserRouter>
                <App />
              </BrowserRouter>
              <Toaster
                position="bottom-right"
                closeButton
                duration={4000}
                toastOptions={{
                  classNames: {
                    toast:
                      'group border-border bg-card text-card-foreground shadow-pop rounded-lg',
                    description: 'text-muted-foreground',
                  },
                }}
              />
            </TooltipProvider>
          </AnonymizedProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
