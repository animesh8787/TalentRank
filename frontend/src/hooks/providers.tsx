import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'

import { anonymizedStore, api, ApiError } from '@/lib/api'
import { auth } from '@/lib/firebase'
import type { User, UserRole } from '@/types'

/** Firebase's own error codes ("auth/wrong-password" etc.) are not something
 * to show a person directly — map the ones worth distinguishing. */
export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code
  switch (code) {
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
    case 'auth/configuration-not-found':
      return 'Firebase is not configured yet — see frontend/.env.example.'
    case 'auth/invalid-email':
      return 'That email address looks invalid.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with that email already exists — try signing in instead.'
    case 'auth/weak-password':
      return 'Please use at least 8 characters.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/network-request-failed':
      return 'Network error — check your connection and try again.'
    default:
      return error instanceof Error ? error.message : 'Something went wrong.'
  }
}

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
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
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
  logout: async () => {},
  resetPassword: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)
  const queryClient = useQueryClient()

  // login()/register() below set this while they're running, and own the
  // resulting state transition themselves. Without this guard, Firebase's own
  // onAuthStateChanged fires the instant createUserWithEmailAndPassword
  // succeeds — racing the explicit register() call below — and calls
  // /auth/me before the profile has been provisioned. That 401 is completely
  // normal mid-registration, not a sign of a broken account, but the naive
  // "401 means sign out" handling here would do exactly that: sign the
  // brand-new user back out from under their own registration.
  const authActionInProgress = React.useRef(false)

  // Firebase is the source of truth for whether a session exists — it
  // restores itself from IndexedDB and calls this on every sign-in, sign-out,
  // and page load, so there's no separate "is there a token?" check needed.
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (authActionInProgress.current) return

      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }
      try {
        const profile = await api.auth.me()
        setUser(profile)
      } catch (error) {
        // A verified Firebase account with no TalentRank profile yet, and not
        // from an in-progress registration (that's the guard above) — e.g. a
        // Firebase user created some other way. Don't leave the app stuck:
        // sign out locally and send them back to register.
        if (error instanceof ApiError && error.status === 401) {
          await signOut(auth)
        }
        setUser(null)
      } finally {
        setLoading(false)
      }
    })
    return unsubscribe
  }, [])

  const login = React.useCallback(
    async (email: string, password: string) => {
      authActionInProgress.current = true
      try {
        await signInWithEmailAndPassword(auth, email, password)
        const profile = await api.auth.me()
        setUser(profile)
        queryClient.clear()
        return profile
      } finally {
        authActionInProgress.current = false
      }
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
      authActionInProgress.current = true
      try {
        const credential = await createUserWithEmailAndPassword(auth, payload.email, payload.password)
        await updateProfile(credential.user, { displayName: payload.full_name })
        const profile = await api.auth.register({ full_name: payload.full_name, role: payload.role })
        setUser(profile)
        queryClient.clear()
        return profile
      } finally {
        authActionInProgress.current = false
      }
    },
    [queryClient],
  )

  const logout = React.useCallback(async () => {
    await signOut(auth)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const resetPassword = React.useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }, [])

  // A 401 from any API call (session expired, token revoked) drops the
  // session exactly once, without a full-page reload.
  React.useEffect(() => {
    const onUnauthorized = () => {
      setUser(null)
      queryClient.clear()
    }
    window.addEventListener('talentrank:unauthorized', onUnauthorized)
    return () => window.removeEventListener('talentrank:unauthorized', onUnauthorized)
  }, [queryClient])

  const value = React.useMemo<AuthValue>(
    () => ({
      user,
      loading,
      isStaff: user?.role === 'recruiter' || user?.role === 'admin',
      login,
      register,
      logout,
      resetPassword,
    }),
    [user, loading, login, register, logout, resetPassword],
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
