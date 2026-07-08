import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://gpt-6qge.onrender.com/api'
// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

export type AuthUser = {
  id: number
  name: string
  email: string
  is_active: boolean
  auth_provider: string
  avatar_url: string | null
  created_at: string | null
  thread_ids: string[]
}

export type AuthResponse = {
  access_token: string
  token_type: string
  expires_at: string
  user: AuthUser
}

export type ThreadMessage = {
  id: number
  user_id: number
  thread_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string | null
}

export type ThreadSummary = {
  thread_id: string
  title: string | null
}

export type ThreadsResponse = {
  thread_ids: string[]
  threads: ThreadSummary[]
}

export type CreatedThreadResponse = {
  thread_id: string
  thread_ids: string[]
  threads: ThreadSummary[]
}

export type DocumentInfo = {
  id: number
  file_id: string
  filename: string
  chunk_count: number
  created_at: string | null
}

type CredentialsPayload = {
  email: string
  password: string
}

type SignupPayload = CredentialsPayload & {
  name: string
}

type GoogleAuthPayload = {
  credential: string
}

function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    let message = text

    try {
      const parsed = JSON.parse(text) as { detail?: string; message?: string }
      message = parsed.detail ?? parsed.message ?? text
    } catch {
      message = text
    }

    throw new Error(message || `Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

export async function signUp(payload: SignupPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse<AuthResponse>(response)
}

export async function signIn(payload: CredentialsPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/signin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse<AuthResponse>(response)
}

export async function login(payload: CredentialsPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse<AuthResponse>(response)
}

export async function googleSignIn(payload: GoogleAuthPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse<AuthResponse>(response)
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: authHeaders(token),
  })

  const data = await parseJsonResponse<{ user: AuthUser }>(response)
  return data.user
}

export async function logout(token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: authHeaders(token),
  })

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to logout: ${response.status}`)
  }
}

export async function fetchUserThreads(
  token: string,
  userId: number,
  signal?: AbortSignal,
): Promise<ThreadSummary[]> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/threads`, {
    headers: authHeaders(token),
    signal,
  })

  const data = await parseJsonResponse<ThreadsResponse>(response)
  return data.threads
}

export async function createUserThread(
  token: string,
  userId: number,
  signal?: AbortSignal,
): Promise<CreatedThreadResponse> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/threads`, {
    method: 'POST',
    headers: authHeaders(token),
    signal,
  })

  return parseJsonResponse<CreatedThreadResponse>(response)
}

export async function streamChat(
  token: string,
  query: string,
  threadId: string,
  userId: number,
  signal?: AbortSignal,
  fileIds?: string[],
) {
  return fetch(`${API_BASE_URL}/users/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeaders(token) ?? {}),
    },
    body: JSON.stringify({
      query,
      user_id: userId,
      thread_id: threadId,
      file_ids: fileIds ?? [],
    }),
    signal,
  })
}

export async function uploadDocuments(
  token: string,
  userId: number,
  files: File[],
  signal?: AbortSignal,
): Promise<DocumentInfo[]> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }

  const response = await fetch(`${API_BASE_URL}/users/${userId}/documents`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
    signal,
  })

  return parseJsonResponse<DocumentInfo[]>(response)
}

export async function fetchDocuments(
  token: string,
  userId: number,
  signal?: AbortSignal,
): Promise<DocumentInfo[]> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/documents`, {
    headers: authHeaders(token),
    signal,
  })

  return parseJsonResponse<DocumentInfo[]>(response)
}

export async function deleteDocument(
  token: string,
  userId: number,
  fileId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/documents/${fileId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
    signal,
  })

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to delete document: ${response.status}`)
  }
}

export async function fetchThreadMessages(
  token: string,
  userId: number,
  threadId: string,
  signal?: AbortSignal,
): Promise<ThreadMessage[]> {
  const response = await axios.get<ThreadMessage[]>(
    `${API_BASE_URL}/users/${userId}/threads/${threadId}/messages`,
    {
      headers: authHeaders(token),
      signal,
    },
  )

  return response.data
}
