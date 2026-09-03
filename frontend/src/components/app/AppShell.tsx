import * as React from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Briefcase,
  Command as CommandIcon,
  EyeOff,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  ScrollText,
  Sun,
  Upload,
  UserCircle,
  Users,
  X,
} from 'lucide-react'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAnonymized, useAuth, useTheme } from '@/hooks/providers'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  Separator,
  Switch,
  Tooltip,
} from '@/components/ui/primitives'
import { CommandPalette } from '@/components/app/CommandPalette'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  staffOnly?: boolean
  candidateOnly?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, staffOnly: true },
  { to: '/jobs', label: 'Roles', icon: Briefcase, staffOnly: true },
  { to: '/candidates', label: 'Candidates', icon: Users, staffOnly: true },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, staffOnly: true },
  { to: '/activity', label: 'Activity', icon: ScrollText, staffOnly: true },
  { to: '/my-resume', label: 'My resume', icon: UserCircle, candidateOnly: true },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isStaff, logout } = useAuth()
  const { anonymized, setAnonymized } = useAnonymized()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const mainRef = React.useRef<HTMLElement>(null)

  const items = NAV.filter((item) => {
    if (item.staffOnly && !isStaff) return false
    if (item.candidateOnly && user?.role !== 'candidate') return false
    return true
  })

  // Cmd/Ctrl+K opens the palette from anywhere.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close the mobile drawer and move focus to main on navigation.
  React.useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 60_000,
    retry: false,
  })

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      {/* Sidebar — persistent at >=1024px, drawer below that */}
      <Sidebar
        items={items}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu aria-hidden="true" />
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group flex h-8 min-w-0 flex-1 max-w-sm cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FileSearch className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Search roles, candidates, actions…</span>
            <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
              <CommandIcon className="size-2.5" aria-hidden="true" />K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {isStaff && <AnonymizedToggle value={anonymized} onChange={setAnonymized} />}
            {health?.matching && (
              <Tooltip
                content={
                  health.matching.state === 'ready'
                    ? `Semantic matching active — ${health.matching.model}`
                    : health.matching.state === 'loading'
                      ? 'Embedding model is still loading; keyword matching is used until it is ready.'
                      : 'Embedding model unavailable — using keyword (TF-IDF) matching.'
                }
              >
                <Badge
                  variant={health.matching.state === 'ready' ? 'success' : 'warning'}
                  className="hidden cursor-help sm:inline-flex"
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      health.matching.state === 'ready' ? 'bg-success' : 'bg-warning',
                    )}
                    aria-hidden="true"
                  />
                  {health.matching.state === 'ready' ? 'Semantic' : 'Keyword'}
                </Badge>
              </Tooltip>
            )}
            <ThemeToggle />
            <Separator orientation="vertical" className="h-6" />
            <UserMenu onLogout={async () => { await logout(); navigate('/login') }} />
          </div>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

function Sidebar({
  items,
  open,
  onClose,
  onOpenPalette,
}: {
  items: NavItem[]
  open: boolean
  onClose: () => void
  onOpenPalette: () => void
}) {
  const content = (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <FileSearch className="size-4" />
        </div>
        <span className="text-sm font-extrabold tracking-tight">TalentRank</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto lg:hidden"
          onClick={onClose}
          aria-label="Close navigation menu"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
                {isActive && (
                  <span className="ml-auto size-1.5 rounded-full bg-primary" aria-hidden="true" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <Button variant="ghost" className="w-full justify-start gap-2.5 font-medium text-muted-foreground" onClick={onOpenPalette}>
          <CommandIcon className="size-4" aria-hidden="true" />
          Command palette
        </Button>
      </div>
    </>
  )

  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card lg:flex">
        {content}
      </aside>

      {/* Mobile drawer */}
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="left-0 top-0 h-dvh w-64 max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden">
          <div className="flex h-full flex-col">{content}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AnonymizedToggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <Tooltip
      content={
        value
          ? 'Names, contact details, universities and locations are hidden. Turn off to see full profiles.'
          : 'Hide names, contact details, universities and locations for a first-pass review focused on skills.'
      }
    >
      <label
        className={cn(
          'flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors',
          value
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <EyeOff className="size-3.5" aria-hidden="true" />
        <span className="hidden md:inline">Blind review</span>
        <Switch checked={value} onCheckedChange={onChange} aria-label="Blind review mode" />
      </label>
    </Tooltip>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <Tooltip content={`Theme: ${theme}. Click to change.`}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Switch theme, currently ${theme}`}
        onClick={() => setTheme(order[(order.indexOf(theme) + 1) % order.length])}
      >
        <Icon aria-hidden="true" />
      </Button>
    </Tooltip>
  )
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth()
  if (!user) return null

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right sm:block">
        <p className="text-xs font-semibold leading-tight">{user.full_name}</p>
        <p className="text-[11px] capitalize leading-tight text-muted-foreground">{user.role}</p>
      </div>
      <Tooltip content="Sign out">
        <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sign out">
          <LogOut aria-hidden="true" />
        </Button>
      </Tooltip>
    </div>
  )
}
