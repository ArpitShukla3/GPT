import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, FileText, Loader2, LogOut, MessageSquarePlus, Paperclip, PanelLeft, Send, TreePine, X } from 'lucide-react'
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
  // deleteDocument,
  fetchDocuments,
  fetchThreadMessages,
  fetchUserThreads,
  streamChat,
  uploadDocuments,
  type DocumentInfo,
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

function createWelcomeMessages(): ChatMessage[] {
  return [
    {
      id: createId(),
      role: 'assistant',
      content: `Welcome! This thread is ready. Upload a PDF with 📎, mention it with **@filename**, and ask anything.`,
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const ready = useAuthStore((state) => state.ready)
  const clearSession = useAuthStore((state) => state.clearSession)
  const hydrateFromStorage = useAuthStore((state) => state.hydrateFromStorage)

  // Document / file state
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [taggedFileIds, setTaggedFileIds] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')

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
        [thread_id]: createWelcomeMessages(),
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

  // Load user's documents on mount
  useEffect(() => {
    if (!ready || !token || !user) return
    const controller = new AbortController()
    fetchDocuments(token, user.id, controller.signal)
      .then((docs) => { if (!controller.signal.aborted) setDocuments(docs) })
      .catch(() => { })
    return () => { controller.abort() }
  }, [ready, token, user])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) setPendingFiles((prev) => [...prev, ...files])
    e.target.value = ''
  }, [])

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const removeTaggedFile = useCallback((fileId: string) => {
    setTaggedFileIds((prev) => prev.filter((id) => id !== fileId))
  }, [])

  // const handleDeleteDocument = useCallback(async (fileId: string) => {
  //   if (!token || !user) return
  //   try {
  //     await deleteDocument(token, user.id, fileId)
  //     setDocuments((prev) => prev.filter((d) => d.file_id !== fileId))
  //     setTaggedFileIds((prev) => prev.filter((id) => id !== fileId))
  //   } catch { /* ignore */ }
  // }, [token, user])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)

    // Detect @ mention
    const cursorPos = e.target.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@(\S*)$/)

    if (atMatch) {
      setShowMentionDropdown(true)
      setMentionFilter(atMatch[1].toLowerCase())
    } else {
      setShowMentionDropdown(false)
      setMentionFilter('')
    }
  }, [])

  const insertMention = useCallback((doc: DocumentInfo) => {
    const cursorPos = textareaRef.current?.selectionStart ?? input.length
    const textBeforeCursor = input.slice(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    const before = input.slice(0, atIndex)
    const after = input.slice(cursorPos)
    setInput(`${before}@${doc.filename} ${after}`)
    if (!taggedFileIds.includes(doc.file_id)) {
      setTaggedFileIds((prev) => [...prev, doc.file_id])
    }
    setShowMentionDropdown(false)
    setMentionFilter('')
    textareaRef.current?.focus()
  }, [input, taggedFileIds])

  const filteredMentionDocs = documents.filter(
    (d) => d.filename.toLowerCase().includes(mentionFilter) && !taggedFileIds.includes(d.file_id),
  )

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
    setShowMentionDropdown(false)

    // Upload any pending files first
    let allFileIds = [...taggedFileIds]
    if (pendingFiles.length > 0) {
      setIsUploading(true)
      try {
        const uploaded = await uploadDocuments(token, user.id, pendingFiles, controller.signal)
        setDocuments((prev) => [...uploaded, ...prev])
        allFileIds = [...allFileIds, ...uploaded.map((d) => d.file_id)]
      } catch {
        // If upload fails, still send the message without the files
      } finally {
        setPendingFiles([])
        setIsUploading(false)
      }
    }

    try {
      const response = await streamChat(
        token,
        userQuery,
        threadId,
        user.id,
        controller.signal,
        allFileIds.length > 0 ? allFileIds : undefined,
      )

      // Tagged file IDs are preserved — user must manually uncheck them

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
      <main className="relative h-dvh overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top_left,oklch(0.55_0.22_265/0.08),transparent_50%),radial-gradient(ellipse_at_bottom_right,oklch(0.6_0.2_330/0.06),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top_left,oklch(0.55_0.22_265/0.12),transparent_50%),radial-gradient(ellipse_at_bottom_right,oklch(0.6_0.2_330/0.1),transparent_50%)]" />
        <div className="relative z-10 flex h-full min-h-0 flex-col lg:flex-row">
          <Sidebar className="border-b border-border/50 bg-sidebar/90 backdrop-blur-xl lg:border-b-0">
            <SidebarContent className="p-0">
              <div className="border-b border-sidebar-border/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-lg border border-primary/20 bg-primary/10 p-1.5">
                      <TreePine className="size-4 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-sm font-bold tracking-tight text-sidebar-foreground">NexusRAG</h1>
                      <p className="text-[10px] text-sidebar-foreground/50">Conversations</p>
                    </div>
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
            <header className="glass shrink-0 border-b border-border/40 px-4 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <SidebarTrigger />
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">
                      {activeThreadId
                        ? threads.find(t => t.thread_id === activeThreadId)?.title?.trim() || `Thread ${activeThreadId.slice(0, 6)}…`
                        : 'No thread selected'}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <ThemeToggle />
              </div>
            </header>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card/50 backdrop-blur-sm">
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
                        'flex animate-message-in',
                        message.role === 'user' ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <div className={cn('flex max-w-[min(44rem,90%)] gap-3', message.role === 'user' && 'flex-row-reverse')}>
                        {message.role === 'assistant' && (
                          <div className="mt-1 shrink-0 rounded-xl border border-primary/20 bg-primary/10 p-1.5 h-fit">
                            <Bot className="size-4 text-primary" />
                          </div>
                        )}
                        <div
                          className={cn(
                            'rounded-2xl px-4 py-3',
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/15'
                              : 'border border-border/60 bg-background/80 backdrop-blur-sm',
                          )}
                        >
                          {message.role === 'assistant' ? (
                            <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-headings:mb-2 prose-headings:mt-3 dark:prose-invert">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">
                              {message.content}
                            </p>
                          )}
                          {message.streaming ? (
                            <div className="mt-2 flex items-center gap-1.5">
                              <div className="size-1.5 animate-pulse rounded-full bg-primary/60" />
                              <div className="size-1.5 animate-pulse rounded-full bg-primary/40" style={{ animationDelay: '150ms' }} />
                              <div className="size-1.5 animate-pulse rounded-full bg-primary/20" style={{ animationDelay: '300ms' }} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="glass shrink-0 border-t border-border/40 p-4 sm:p-5">
                {/* Tagged files chips */}
                {taggedFileIds.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {taggedFileIds.map((fileId) => {
                      const doc = documents.find((d) => d.file_id === fileId)
                      return (
                        <span
                          key={fileId}
                          className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                        >
                          <FileText className="size-3" />
                          {doc?.filename ?? fileId.slice(0, 8)}
                          <button
                            type="button"
                            onClick={() => removeTaggedFile(fileId)}
                            className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-indigo-200 dark:hover:bg-indigo-500/20"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Pending file uploads chips */}
                {pendingFiles.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {pendingFiles.map((file, index) => (
                      <span
                        key={`${file.name}-${index}`}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                          isUploading
                            ? 'animate-pulse border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
                        )}
                      >
                        {isUploading ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Paperclip className="size-3" />
                        )}
                        {file.name}
                        {!isUploading && (
                          <button
                            type="button"
                            onClick={() => removePendingFile(index)}
                            className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-emerald-200 dark:hover:bg-emerald-500/20"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  {/* @-mention dropdown */}
                  {showMentionDropdown && filteredMentionDocs.length > 0 && (
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-72 max-h-48 overflow-y-auto rounded-xl border border-border/70 bg-background/95 shadow-xl backdrop-blur-xl">
                      <div className="p-1.5">
                        <p className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                          Mention a document
                        </p>
                        {filteredMentionDocs.map((doc) => (
                          <button
                            key={doc.file_id}
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              insertMention(doc)
                            }}
                          >
                            <FileText className="size-4 shrink-0 text-indigo-500" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{doc.filename}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {doc.chunk_count} chunks
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showMentionDropdown && filteredMentionDocs.length === 0 && documents.length === 0 && (
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border/70 bg-background/95 p-4 text-center text-xs text-muted-foreground shadow-xl backdrop-blur-xl">
                      No documents uploaded yet. Use the 📎 button to upload PDFs first.
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-h-24 flex-1">
                      <textarea
                        ref={textareaRef}
                        className="min-h-24 w-full resize-none rounded-2xl border border-input bg-background py-3 pl-12 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            sendRequest()
                          }
                          if (event.key === 'Escape' && showMentionDropdown) {
                            setShowMentionDropdown(false)
                          }
                        }}
                        onBlur={() => {
                          // Delay hiding so click on dropdown item works
                          setTimeout(() => setShowMentionDropdown(false), 200)
                        }}
                        placeholder="Ask something… Type @ to mention a document"
                      />
                      {/* Paperclip button */}
                      <button
                        type="button"
                        className="absolute left-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach PDF files"
                      >
                        <Paperclip className="size-4" />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </div>
                    <Button className="h-12 rounded-2xl px-5 shadow-lg shadow-primary/20 sm:self-end" onClick={sendRequest} disabled={isUploading}>
                      {isUploading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Building tree…
                        </>
                      ) : (
                        <>
                          <Send className="size-4" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter sends · Shift+Enter new line · @ to mention a file · 📎 to attach PDFs
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
