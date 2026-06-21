import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { LoaderCircle, LogIn } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import ShootingStarsBackground from '@/components/starry-background'
// import { cn } from '@/lib/utils'
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
        ? 'Create an account to save chat threads and use Google sign-in later.'
        : 'Sign in to continue your chat history and resume saved threads.',
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
          <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/95 p-6 shadow-2xl shadow-black/5 backdrop-blur sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(244,114,182,0.12),_transparent_30%)]" />
            
            <div className="relative z-10">
              <div className="mb-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                  aiChat Access
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {title}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {subtitle}
                </p>
              </div>

              <div className="inline-flex w-full rounded-full border bg-background p-1 shadow-sm mb-6">
                <Button
                  variant={isSignup ? 'ghost' : 'default'}
                  size="sm"
                  className="w-1/2 rounded-full"
                  asChild
                >
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button
                  variant={isSignup ? 'default' : 'ghost'}
                  size="sm"
                  className="w-1/2 rounded-full"
                  asChild
                >
                  <Link to="/signup">Sign up</Link>
                </Button>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {isSignup ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="name">
                      Name
                    </label>
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
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
                    required
                  />
                </div>

                <div className="space-y-2">
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
                    minLength={8}
                    required
                  />
                </div>

                {error ? (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <Button type="submit" className="h-11 w-full rounded-xl" disabled={isSubmitting}>
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
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                  or
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* {googleClientId ? (
                <div
                  ref={googleButtonRef}
                  className={cn('min-h-11', !isGoogleReady && 'animate-pulse rounded-xl bg-muted/40')}
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  Google sign-in is not configured. Set `VITE_GOOGLE_CLIENT_ID` to enable it.
                </div>
              )} */}

              <p className="mt-6 text-sm text-muted-foreground">
                {isSignup ? (
                  <>
                    Already have an account? <Link className="text-foreground underline" to="/login">Sign in</Link>
                  </>
                ) : (
                  <>
                    Need an account? <Link className="text-foreground underline" to="/signup">Sign up</Link>
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
