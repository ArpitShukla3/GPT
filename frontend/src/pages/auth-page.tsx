import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { LoaderCircle, LogIn, TreePine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import ShootingStarsBackground from '@/components/starry-background'
import { googleSignIn, login, signUp } from '@/lib/api'
import { useAuthStore } from '@/stores/use-auth-store'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
            auto_select?: boolean
            cancel_on_tap_outside?: boolean
          }) => void
          renderButton: (
            element: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black'
              size?: 'large' | 'medium' | 'small'
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
              width?: string
              shape?: 'rectangular' | 'pill' | 'circle' | 'square'
            },
          ) => void
          prompt: () => void
        }
      }
    }
  }
}

type AuthMode = 'signin' | 'signup'

type AuthPageProps = {
  mode: AuthMode
}

const GOOGLE_SCRIPT_ID = 'google-identity-services'

function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleReady, setIsGoogleReady] = useState(false)
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const ready = useAuthStore((state) => state.ready)
  const setSession = useAuthStore((state) => state.setSession)
  const hydrateFromStorage = useAuthStore((state) => state.hydrateFromStorage)

  const isSignup = mode === 'signup'
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  useEffect(() => {
    if (!ready) {
      hydrateFromStorage()
    }
  }, [hydrateFromStorage, ready])

  useEffect(() => {
    if (ready && token && user) {
      navigate('/chat', { replace: true })
    }
  }, [navigate, ready, token, user])

  useEffect(() => {
    if (!googleClientId) {
      return
    }

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID)
    if (!existingScript) {
      const script = document.createElement('script')
      script.id = GOOGLE_SCRIPT_ID
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => setIsGoogleReady(true)
      document.head.appendChild(script)
    } else if (window.google) {
      setIsGoogleReady(true)
    }
  }, [googleClientId])

  useEffect(() => {
    if (!googleClientId || !isGoogleReady || !googleButtonRef.current || !window.google) {
      return
    }

    googleButtonRef.current.innerHTML = ''
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async ({ credential }) => {
        try {
          setError(null)
          const response = await googleSignIn({ credential })
          setSession(response.access_token, response.user)
          navigate('/chat', { replace: true })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google sign-in failed')
        }
      },
    })

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      text: isSignup ? 'signup_with' : 'signin_with',
      width: '100%',
      shape: 'rectangular',
    })
  }, [googleClientId, isGoogleReady, isSignup, navigate, setSession])

  const title = useMemo(
    () => (isSignup ? 'Create your account' : 'Welcome back'),
    [isSignup],
  )

  const subtitle = useMemo(
    () =>
      isSignup
        ? 'Sign up to start building your AI-powered knowledge base.'
        : 'Sign in to continue your conversations and document analysis.',
    [isSignup],
  )

  if (ready && token && user) {
    return <Navigate to="/chat" replace />
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        email,
        password,
      }

      const response = isSignup
        ? await signUp({
            ...payload,
            name,
          })
        : await login(payload)

      setSession(response.access_token, response.user)
      navigate('/chat', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ShootingStarsBackground />
      <div className="fixed top-6 right-6 z-50">
        <ThemeToggle />
      </div>
      <main className="relative z-10 flex min-h-svh items-center justify-center bg-transparent px-4 py-12">
        <div className="relative w-full max-w-md">
          <section className="glass relative overflow-hidden rounded-3xl border border-border/50 p-6 shadow-2xl shadow-black/10 sm:p-8">
            {/* Ambient gradient overlays */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />

            <div className="relative z-10">
              {/* Logo */}
              <div className="mb-6 flex flex-col items-center gap-3">
                <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3">
                  <TreePine className="size-6 text-primary" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                  NexusRAG
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {title}
                </h1>
                <p className="text-center text-sm text-muted-foreground">
                  {subtitle}
                </p>
              </div>

              {/* Tab toggle */}
              <div className="inline-flex w-full rounded-xl border border-border/60 bg-muted/40 p-1 mb-6">
                <Button
                  variant={isSignup ? 'ghost' : 'default'}
                  size="sm"
                  className="w-1/2 rounded-lg"
                  asChild
                >
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button
                  variant={isSignup ? 'default' : 'ghost'}
                  size="sm"
                  className="w-1/2 rounded-lg"
                  asChild
                >
                  <Link to="/signup">Sign up</Link>
                </Button>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {isSignup ? (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground" htmlFor="name">
                      Name
                    </label>
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      className="rounded-xl"
                      required
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    className="rounded-xl"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="password">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    className="rounded-xl"
                    minLength={8}
                    required
                  />
                </div>

                {error ? (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl text-sm font-medium shadow-lg shadow-primary/20"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      {isSignup ? 'Creating account…' : 'Signing in…'}
                    </>
                  ) : (
                    <>
                      <LogIn className="size-4" />
                      {isSignup ? 'Create account' : 'Sign in'}
                    </>
                  )}
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                  or
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>

              <p className="text-center text-sm text-muted-foreground">
                {isSignup ? (
                  <>
                    Already have an account?{' '}
                    <Link className="font-medium text-primary hover:underline" to="/login">
                      Sign in
                    </Link>
                  </>
                ) : (
                  <>
                    Need an account?{' '}
                    <Link className="font-medium text-primary hover:underline" to="/signup">
                      Sign up
                    </Link>
                  </>
                )}
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}

export default AuthPage
