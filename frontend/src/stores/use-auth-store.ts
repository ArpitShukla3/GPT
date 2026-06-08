import { create } from 'zustand'

import type { AuthUser } from '@/lib/api'

const AUTH_TOKEN_KEY = 'aichat-auth-token'
const AUTH_USER_KEY = 'aichat-auth-user'

type AuthState = {
  token: string | null
  user: AuthUser | null
  ready: boolean
  setSession: (token: string, user: AuthUser) => void
  clearSession: () => void
  hydrateFromStorage: () => void
}

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  ready: false,
  setSession: (token, user) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    set({ token, user, ready: true })
  },
  clearSession: () => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    set({ token: null, user: null, ready: true })
  },
  hydrateFromStorage: () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    const user = readStoredUser()
    set({
      token,
      user,
      ready: true,
    })
  },
}))
