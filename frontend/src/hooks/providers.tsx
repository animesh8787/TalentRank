import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { anonymizedStore, api, tokenStore } from '@/lib/api'
import type { User, UserRole } from '@/types'

/* -------------------------------------------------------------------------- */
/* Theme                                                                      */
/* -------------------------------------------------------------------------- */
type Theme = 'light' | 'dark' | 'system'

const ThemeContext = React.createContext<{
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}>({ theme: 'system', resolved: 'light', setTheme: () => {} })

const THEME_KEY = 'talentrank.theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) || 'system'
    } catch {
      return 'system'
    }
  })
  const [resolved, setResolved] = React.useState<'light' | 'dark'>('light')

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const next = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      setResolved(next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      document.documentElement.style.colorScheme = next
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* private browsing */
    }
  }, [])

  const value = React.useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => React.useContext(ThemeContext)

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */
interface AuthValue {
  user: User | null
  loading: boolean
  isStaff: boolean
  login: (email: string, password: string) => Promise<User>
  register: (payload: {
    email: string
    password: string
    full_name: string
    role: 'recruiter' | 'candidate'
  }) => Promise<User>
  logout: () => void
}

const AuthContext = React.createContext<AuthValue>({
  user: null,
  loading: true,
  isStaff: false,
  login: async () => {
    throw new Error('AuthProvider missing')
  },
  register: async () => {
    throw new Error('AuthProvider missing')
  },
  logout: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)
  const queryClient = useQueryClient()

  // Restore the session on first paint if a token is present.
  React.useEffect(() => {
    let cancelled = false
    if (!tokenStore.get()) {
      setLoading(false)
      return
    }
    api.auth
      .me()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => {
        tokenStore.clear()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A 401 anywhere in the app drops the session exactly once.
  React.useEffect(() => {
    const onUnauthorized = () => {
      setUser(null)
      queryClient.clear()
    }
    window.addEventListener('talentrank:unauthorized', onUnauthorized)
    return () => window.removeEventListener('talentrank:unauthorized', onUnauthorized)
  }, [queryClient])

  const login = React.useCallback(
    async (email: string, password: string) => {
      const result = await api.auth.login(email, password)
      tokenStore.set(result.access_token)
      setUser(result.user)
      queryClient.clear()
      return result.user
    },
    [queryClient],
  )

  const register = React.useCallback(
    async (payload: {
      email: string
      password: string
      full_name: string
      role: 'recruiter' | 'candidate'
    }) => {
      const result = await api.auth.register(payload)
      tokenStore.set(result.access_token)
      setUser(result.user)
      queryClient.clear()
      return result.user
    },
    [queryClient],
  )

  const logout = React.useCallback(() => {
    tokenStore.clear()
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const value = React.useMemo<AuthValue>(
    () => ({
      user,
      loading,
      isStaff: user?.role === 'recruiter' || user?.role === 'admin',
      login,
      register,
      logout,
    }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => React.useContext(AuthContext)

export function hasRole(user: User | null, ...roles: UserRole[]) {
  return !!user && (user.role === 'admin' || roles.includes(user.role))
}

/* -------------------------------------------------------------------------- */
/* Anonymised review mode                                                     */
/* -------------------------------------------------------------------------- */
const AnonymizedContext = React.createContext<{
  anonymized: boolean
  setAnonymized: (value: boolean) => void
}>({ anonymized: false, setAnonymized: () => {} })

export function AnonymizedProvider({ children }: { children: React.ReactNode }) {
  const [anonymized, setAnonymizedState] = React.useState(() => anonymizedStore.get())
  const queryClient = useQueryClient()

  const setAnonymized = React.useCallback(
    (value: boolean) => {
      anonymizedStore.set(value)
      setAnonymizedState(value)
      // Redaction happens on the server, so every cached payload is now stale.
      queryClient.invalidateQueries()
    },
    [queryClient],
  )

  const value = React.useMemo(() => ({ anonymized, setAnonymized }), [anonymized, setAnonymized])
  return <AnonymizedContext.Provider value={value}>{children}</AnonymizedContext.Provider>
}

export const useAnonymized = () => React.useContext(AnonymizedContext)
