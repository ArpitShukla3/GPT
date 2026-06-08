import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LogOut, MessageSquarePlus, PanelLeft } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  logout,
  createUserThread,
  fetchThreadMessages,
  fetchUserThreads,
  streamChat,
  type ThreadMessage,
  type ThreadSummary,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/use-auth-store'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

function createId() {
  return crypto.randomUUID()
}

function createWelcomeMessages(threadId: string): ChatMessage[] {
  return [
    {
      id: createId(),
      role: 'assistant',
      content: `Thread \`${threadId}\` is ready. Send a message and I will keep streaming in this conversation.`,
    },
  ]
}

function formatThreadLabel(thread: ThreadSummary) {
  return thread.title?.trim() || `${thread.thread_id.slice(0, 8)}…`
}

function mapThreadMessage(message: ThreadMessage): ChatMessage {
  return {
    id: String(message.id),
    role: message.role,
    content: message.content,
  }
}

function ThreadHistorySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'flex',
            index % 2 === 0 ? 'justify-start' : 'justify-end',
          )}
        >
          <div
            className={cn(
              'max-w-[min(44rem,88%)] rounded-2xl border px-4 py-3 shadow-sm',
              index % 2 === 0
                ? 'border-border bg-background'
                : 'border-primary/20 bg-primary/10',
            )}
          >
            <div className="space-y-2">
              <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-72 max-w-full animate-pulse rounded-full bg-muted/80" />
              <div className="h-3 w-56 max-w-full animate-pulse rounded-full bg-muted/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChatPage() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messagesByThread, setMessagesByThread] = useState<
    Record<string, ChatMessage[]>
  >({})
  const [isLoadingThreads, setIsLoadingThreads] = useState(true)
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const ready = useAuthStore((state) => state.ready)
  const clearSession = useAuthStore((state) => state.clearSession)
  const hydrateFromStorage = useAuthStore((state) => state.hydrateFromStorage)

  useEffect(() => {
    if (!ready) {
      hydrateFromStorage()
    }
  }, [hydrateFromStorage, ready])

  const activeThreadMessages = activeThreadId
    ? messagesByThread[activeThreadId]
    : undefined
  const messages = activeThreadMessages ?? []

  const selectThread = (threadId: string) => {
    setActiveThreadId(threadId)
  }

  const createAndSelectThread = async () => {
    if (isCreatingThread) {
      return activeThreadId
    }

    setIsCreatingThread(true)

    try {
      if (!token || !user) {
        throw new Error('Missing authentication state')
      }

      const { thread_id, threads: createdThreads } = await createUserThread(token, user.id)
      setThreads(createdThreads)
      setMessagesByThread((current) => ({
        ...current,
        [thread_id]: createWelcomeMessages(thread_id),
      }))
      setActiveThreadId(thread_id)
      return thread_id
    } finally {
      setIsCreatingThread(false)
    }
  }

  useEffect(() => {
    if (!ready || !token || !user) {
      return
    }

    const controller = new AbortController()

    const loadThreads = async () => {
      try {
        const threadList = await fetchUserThreads(token, user.id, controller.signal)
        if (controller.signal.aborted) {
          return
        }

        if (threadList.length === 0) {
          const createdThread = await createUserThread(
            token,
            user.id,
            controller.signal,
          )
          if (controller.signal.aborted) {
            return
          }

          setThreads(createdThread.threads)
          selectThread(createdThread.thread_id)
          return
        }

        setThreads(threadList)
        setActiveThreadId((current) => current ?? threadList[0]?.thread_id ?? null)
      } catch {
        if (!controller.signal.aborted) {
          setThreads([])
          setActiveThreadId(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingThreads(false)
        }
      }
    }

    loadThreads()

    return () => {
      controller.abort()
    }
  }, [ready, token, user])

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }, [messages])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!ready || !token || !user) {
      return
    }

    if (!activeThreadId) {
      return
    }

    if (messagesByThread[activeThreadId] !== undefined) {
      return
    }

    const controller = new AbortController()

    const loadThreadMessages = async () => {
      try {
        const threadMessages = await fetchThreadMessages(
          token,
          user.id,
          activeThreadId,
          controller.signal,
        )

        if (controller.signal.aborted) {
          return
        }

        setMessagesByThread((current) => {
          if (current[activeThreadId] !== undefined) {
            return current
          }

          return {
            ...current,
            [activeThreadId]: threadMessages.map(mapThreadMessage),
          }
        })
      } catch {
        if (!controller.signal.aborted) {
          setMessagesByThread((current) => {
            if (current[activeThreadId] !== undefined) {
              return current
            }

            return {
              ...current,
              [activeThreadId]: [],
            }
          })
        }
      }
    }

    loadThreadMessages()

    return () => {
      controller.abort()
    }
  }, [activeThreadId, messagesByThread, ready, token, user])

  const sendRequest = async () => {
    const userQuery = input.trim()

    if (!userQuery) {
      return
    }

    abortControllerRef.current?.abort()

    const controller = new AbortController()
    abortControllerRef.current = controller

    if (!token || !user) {
      return
    }

    const threadId = activeThreadId ?? (await createAndSelectThread())

    if (!threadId) {
      return
    }

    const assistantMessageId = createId()
    const shouldRefreshThreadTitles =
      !threads.find((thread) => thread.thread_id === threadId)?.title?.trim()
    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      content: userQuery,
    }

    setMessagesByThread((current) => {
      const existingMessages = current[threadId] ?? []

      return {
        ...current,
        [threadId]: [
          ...existingMessages,
          userMessage,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            streaming: true,
          },
        ],
      }
    })

    setInput('')

    try {
      const response = await streamChat(
        token,
        userQuery,
        threadId,
        user.id,
        controller.signal,
      )

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }

      if (!response.body) {
        throw new Error('Streaming response body was not available')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamedContent = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        streamedContent += decoder.decode(value, { stream: true })

        setMessagesByThread((current) => {
          const threadMessages = current[threadId] ?? []

          return {
            ...current,
            [threadId]: threadMessages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: streamedContent,
                    streaming: true,
                  }
                : message,
            ),
          }
        })
      }

      streamedContent += decoder.decode()

      setMessagesByThread((current) => {
        const threadMessages = current[threadId] ?? []

        return {
          ...current,
          [threadId]: threadMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: streamedContent,
                  streaming: false,
                }
              : message,
          ),
        }
      })
    } catch {
      if (controller.signal.aborted) {
        return
      }

      setMessagesByThread((current) => {
        const threadMessages = current[threadId] ?? []

        return {
          ...current,
          [threadId]: threadMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: 'Sorry, the streamed response could not be loaded.',
                  streaming: false,
                }
              : message,
          ),
        }
      })
    } finally {
      if (shouldRefreshThreadTitles && !controller.signal.aborted && token && user) {
        try {
          const latestThreads = await fetchUserThreads(token, user.id, controller.signal)
          if (!controller.signal.aborted) {
            setThreads(latestThreads)
          }
        } catch {
          // Ignore refresh failures. The streamed response has already been handled.
        }
      }

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

  const handleLogout = async () => {
    if (!token) {
      clearSession()
      navigate('/login', { replace: true })
      return
    }

    try {
      await logout(token)
    } finally {
      clearSession()
      navigate('/login', { replace: true })
    }
  }

  if (ready && (!token || !user)) {
    return <Navigate to="/login" replace />
  }

  if (!ready) {
    return (
      <main className="relative z-10 flex min-h-svh items-center justify-center bg-transparent">
        <div className="rounded-2xl border border-border bg-card px-6 py-4 text-sm text-muted-foreground shadow-sm">
          Loading session…
        </div>
      </main>
    )
  }

  return (
    <SidebarProvider>
      <main className="relative h-dvh overflow-hidden bg-slate-50/50 dark:bg-slate-950 bg-gradient-to-br from-indigo-50/10 via-sky-50/5 to-emerald-50/10 dark:from-slate-950 dark:via-indigo-950/20 dark:to-slate-900">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_0%_0%,rgba(99,102,241,0.08),transparent_40%),radial-gradient(circle_at_100%_100%,rgba(244,63,94,0.06),transparent_40%)] dark:bg-[radial-gradient(circle_at_0%_0%,rgba(99,102,241,0.15),transparent_40%),radial-gradient(circle_at_100%_100%,rgba(244,63,94,0.12),transparent_40%)] pointer-events-none" />
        <div className="relative z-10 flex h-full min-h-0 flex-col lg:flex-row">
          <Sidebar className="border-b border-border/70 bg-sidebar/95 backdrop-blur lg:border-b-0">
            <SidebarContent className="p-0">
              <div className="border-b border-sidebar-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.35em] text-sidebar-foreground/60">
                      Conversations
                    </p>
                    <h1 className="mt-2 text-lg font-semibold tracking-tight text-sidebar-foreground">
                      Thread history
                    </h1>
                  </div>
                  <SidebarTrigger />
                </div>
              </div>

              <div className="min-h-0 flex-1 p-3">
                <div className="mb-3 flex items-center justify-between gap-2 px-2">
                  <p className="text-sm text-sidebar-foreground/70">
                    {isLoadingThreads ? 'Loading threads…' : `${threads.length} saved thread${threads.length === 1 ? '' : 's'}`}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    onClick={createAndSelectThread}
                    disabled={isCreatingThread}
                  >
                    <MessageSquarePlus className="size-4" />
                    New
                  </Button>
                </div>

                <ScrollArea className="h-[calc(100%-3rem)]">
                  <SidebarGroup>
                    <SidebarGroupLabel>Threads</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {threads.map((thread) => (
                          <SidebarMenuItem key={thread.thread_id}>
                            <SidebarMenuButton
                              type="button"
                              isActive={thread.thread_id === activeThreadId}
                              onClick={() => selectThread(thread.thread_id)}
                              className="justify-start"
                            >
                              <PanelLeft className="size-4 shrink-0" />
                              <span className="truncate">
                                {formatThreadLabel(thread)}
                              </span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>

                      {threads.length === 0 && !isLoadingThreads ? (
                        <div className="rounded-2xl border border-dashed border-sidebar-border/80 px-4 py-6 text-sm text-sidebar-foreground/60">
                          No threads yet. Create one to begin.
                        </div>
                      ) : null}
                    </SidebarGroupContent>
                  </SidebarGroup>
                </ScrollArea>
              </div>

              <SidebarFooter>
                <div className="space-y-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-sidebar-foreground/50">
                      Signed in
                    </p>
                    <p className="mt-1 text-sm font-medium text-sidebar-foreground">
                      {user?.name}
                    </p>
                    <p className="text-xs text-sidebar-foreground/70">
                      {user?.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start rounded-xl"
                    onClick={handleLogout}
                  >
                    <LogOut className="size-4" />
                    Logout
                  </Button>
                </div>
              </SidebarFooter>
            </SidebarContent>
          </Sidebar>

          <SidebarInset className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-border/70 bg-card/80 px-4 py-4 shadow-sm shadow-black/5 backdrop-blur sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <SidebarTrigger />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.35em] text-muted-foreground">
                      Chat route
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                      {activeThreadId
                        ? `Thread ${activeThreadId.slice(0, 8)}…`
                        : 'No thread selected'}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {activeThreadId ? (
                    <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                      {activeThreadId}
                    </div>
                  ) : null}
                  <div className="hidden rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground sm:block">
                    {user?.email}
                  </div>
                  <ThemeToggle />
                </div>
              </div>
            </header>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-3xl border-t border-border/70 bg-card/90 shadow-2xl shadow-black/5 backdrop-blur">
              <ScrollArea viewportRef={viewportRef} className="min-h-0 flex-1">
                <div className="space-y-4 p-5 sm:p-6">
                  {activeThreadId && activeThreadMessages === undefined ? (
                    <ThreadHistorySkeleton />
                  ) : null}

                  {activeThreadId && activeThreadMessages?.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      This thread has no saved messages yet.
                    </div>
                  ) : null}

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'flex',
                        message.role === 'user' ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[min(46rem,92%)] rounded-2xl border px-4 py-3 shadow-sm',
                          message.role === 'user'
                            ? 'border-primary/20 bg-primary text-primary-foreground'
                            : 'border-border bg-background',
                        )}
                      >
                        {message.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-headings:mb-2 prose-headings:mt-4 prose-quote:my-3 dark:prose-invert">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-6">
                            {message.content}
                          </p>
                        )}
                        {message.streaming ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            streaming...
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="shrink-0 border-t border-border/70 bg-background/80 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <textarea
                    className="min-h-24 flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        sendRequest()
                      }
                    }}
                    placeholder="Ask something and press Enter to send..."
                  />
                  <Button className="sm:self-end" onClick={sendRequest}>
                    Send
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter sends. Shift+Enter inserts a new line.
                </p>
              </div>
            </section>
          </SidebarInset>
        </div>
      </main>
    </SidebarProvider>
  )
}

export default ChatPage
