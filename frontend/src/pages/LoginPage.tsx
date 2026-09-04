import * as React from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSearch, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { toast } from 'sonner'

import { friendlyAuthError, useAuth } from '@/hooks/providers'
import { isFirebaseConfigured } from '@/lib/firebase'
import {
  Button,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/primitives'

export function LoginPage() {
  const { login, register, resetPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // Landing-page CTAs link here with ?mode=register to land straight on the
  // right tab instead of making someone click "Register" a second time.
  const [mode, setMode] = React.useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login',
  )
  const [pending, setPending] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [fullName, setFullName] = React.useState('')
  const [role, setRole] = React.useState<'candidate' | 'recruiter'>('candidate')

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname

  function validate() {
    const next: Record<string, string> = {}
    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      next.email = 'That does not look like a valid email address.'
    if (!password) next.password = 'Enter your password.'
    else if (mode === 'register' && password.length < 8)
      next.password = 'Use at least 8 characters.'
    if (mode === 'register' && !fullName.trim()) next.full_name = 'Enter your full name.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return

    setPending(true)
    try {
      const user =
        mode === 'login'
          ? await login(email.trim(), password)
          : await register({
              email: email.trim(),
              password,
              full_name: fullName.trim(),
              role,
            })
      toast.success(`Welcome, ${user.full_name}`)
      const isStaff = user.role === 'recruiter' || user.role === 'admin'
      navigate(from ?? (isStaff ? '/dashboard' : '/my-resume'), { replace: true })
    } catch (error) {
      const message = friendlyAuthError(error)
      setErrors({ form: message })
      toast.error(mode === 'login' ? 'Sign in failed' : 'Could not create account', {
        description: message,
      })
    } finally {
      setPending(false)
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setErrors({ email: 'Enter your email address first, then click "Forgot password?" again.' })
      return
    }
    setResetting(true)
    try {
      await resetPassword(email.trim())
      toast.success('Password reset email sent', {
        description: `Check ${email.trim()} for a link to choose a new password.`,
      })
    } catch (error) {
      toast.error('Could not send reset email', { description: friendlyAuthError(error) })
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel — hidden on small screens where it would just push the form down */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 0, transparent 45%), radial-gradient(circle at 80% 70%, white 0, transparent 40%)',
          }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary-foreground/15">
            <FileSearch className="size-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-extrabold tracking-tight">TalentRank</span>
        </div>

        <div className="relative space-y-6">
          <h1 className="max-w-md text-3xl font-extrabold leading-tight tracking-tight">
            Screening that shows its working.
          </h1>
          <p className="max-w-md text-sm text-primary-foreground/80">
            Rank every applicant against a role in seconds — and see exactly which skills,
            experience and evidence produced the score.
          </p>
          <ul className="space-y-3 text-sm">
            {[
              { icon: Sparkles, text: 'Semantic matching that knows ML means machine learning' },
              { icon: CheckCircle2, text: 'Every score traced back to a line in the resume' },
              { icon: ShieldCheck, text: 'Blind review mode to cut bias on the first pass' },
              { icon: Users, text: 'Pipeline, notes and shortlists in one place' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary-foreground/70" aria-hidden="true" />
                <span className="text-primary-foreground/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          Resume screening &amp; explainable candidate ranking
        </p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to home
          </Link>

          <div className="lg:hidden">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <FileSearch className="size-5" aria-hidden="true" />
              </div>
              <span className="text-lg font-extrabold tracking-tight">TalentRank</span>
            </div>
          </div>

          {!isFirebaseConfigured && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Firebase isn't configured yet</p>
                <p className="mt-0.5 text-xs">
                  Sign-in won't work until <code>VITE_FIREBASE_*</code> env vars are set — see{' '}
                  <code>frontend/.env.example</code>.
                </p>
              </div>
            </div>
          )}

          <div>
            <h2 className="text-xl font-extrabold tracking-tight">
              {mode === 'login' ? 'Sign in' : 'Create your account'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'login'
                ? 'Use your work email to continue.'
                : 'Candidates can track how their resume was read.'}
            </p>
          </div>

          <Tabs value={mode} onValueChange={(value) => { setMode(value as 'login' | 'register'); setErrors({}) }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {errors.form && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
              >
                {errors.form}
              </div>
            )}

            {mode === 'register' && (
              <Field label="Full name" htmlFor="full_name" required error={errors.full_name}>
                <Input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                />
              </Field>
            )}

            <Field label="Email" htmlFor="email" required error={errors.email}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              required
              error={errors.password}
              hint={mode === 'register' ? 'At least 8 characters.' : undefined}
            >
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetting}
                className="cursor-pointer text-xs font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetting ? 'Sending…' : 'Forgot password?'}
              </button>
            )}

            {mode === 'register' && (
              <Field label="I am a" htmlFor="role">
                <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candidate">Candidate — I want to submit my resume</SelectItem>
                    <SelectItem value="recruiter">Recruiter — I am hiring</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Button type="submit" className="w-full" size="lg" loading={pending}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
