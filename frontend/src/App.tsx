import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { useAuth } from '@/hooks/providers'
import { AppShell } from '@/components/app/AppShell'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'

// Route-level splitting. The charting library alone is ~400kB and is only
// needed on Analytics and in the explanation drawer, so it should not sit in
// the bundle every user downloads before they can sign in.
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const JobsPage = lazy(() => import('@/pages/JobsPage').then((m) => ({ default: m.JobsPage })))
const JobDetailPage = lazy(() =>
  import('@/pages/JobDetailPage').then((m) => ({ default: m.JobDetailPage })),
)
const CandidatesPage = lazy(() =>
  import('@/pages/CandidatesPage').then((m) => ({ default: m.CandidatesPage })),
)
const UploadPage = lazy(() => import('@/pages/UploadPage').then((m) => ({ default: m.UploadPage })))
const AnalyticsPage = lazy(() =>
  import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const ActivityPage = lazy(() =>
  import('@/pages/ActivityPage').then((m) => ({ default: m.ActivityPage })),
)
const MyResumePage = lazy(() =>
  import('@/pages/MyResumePage').then((m) => ({ default: m.MyResumePage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

function FullPageSpinner({ label = 'Loading TalentRank…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

/** Reserves the same space as a page so a route swap does not shift layout. */
function RouteFallback() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Loading page…</span>
    </div>
  )
}

function RequireAuth({ children, staff }: { children: React.ReactNode; staff?: boolean }) {
  const { user, loading, isStaff } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (staff && !isStaff) return <Navigate to="/upload" replace />
  return <>{children}</>
}

export default function App() {
  const { user, loading, isStaff } = useAuth()

  if (loading) return <FullPageSpinner />

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? <Navigate to={isStaff ? '/dashboard' : '/my-resume'} replace /> : <LandingPage />
        }
      />
      <Route
        path="/login"
        element={user ? <Navigate to={isStaff ? '/dashboard' : '/my-resume'} replace /> : <LoginPage />}
      />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/dashboard" element={<RequireAuth staff><DashboardPage /></RequireAuth>} />
                  <Route path="/jobs" element={<RequireAuth staff><JobsPage /></RequireAuth>} />
                  <Route path="/jobs/:jobId" element={<RequireAuth staff><JobDetailPage /></RequireAuth>} />
                  <Route path="/candidates" element={<RequireAuth staff><CandidatesPage /></RequireAuth>} />
                  <Route path="/analytics" element={<RequireAuth staff><AnalyticsPage /></RequireAuth>} />
                  <Route path="/activity" element={<RequireAuth staff><ActivityPage /></RequireAuth>} />
                  <Route path="/upload" element={<UploadPage />} />
                  <Route path="/my-resume" element={<MyResumePage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
