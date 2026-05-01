'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type ChatMessage = {
  id: string
  projectId: string
  senderId: string
  senderName: string
  content: string
  messageType: 'text' | 'photo' | 'system' | string
  attachmentUrls: string[]
  createdAt: string
}

type ProjectChatProps = {
  projectId: string
  currentUserId: string
  currentUserName: string
  active: boolean
  onUnreadCountChange?: (count: number) => void
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatMessageTime(dateValue: string) {
  const date = new Date(dateValue)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return time
  if (isYesterday) return `Yesterday ${time}`
  return `${date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}, ${time}`
}

function dateSeparatorLabel(dateValue: string) {
  const date = new Date(dateValue)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'Today'

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

  return date.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })
}

export default function ProjectChat({
  projectId,
  currentUserId,
  currentUserName,
  active,
  onUnreadCountChange,
}: ProjectChatProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  )

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
  }, [])

  const scrollToBottomAfterPaint = useCallback((behavior: ScrollBehavior = 'auto') => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollToBottom(behavior)
      })
    })
  }, [scrollToBottom])

  const mergeMessages = (incoming: ChatMessage[]) => {
    setMessages((previous) => {
      const byId = new Map<string, ChatMessage>()
      for (const item of previous) byId.set(item.id, item)
      for (const item of incoming) {
        byId.set(item.id, {
          ...item,
          senderName: item.senderName || (item.senderId === currentUserId ? currentUserName : 'User'),
        })
      }
      return Array.from(byId.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    })
  }

  const loadMessages = async (
    markRead: boolean,
    options: { showLoader?: boolean; silent?: boolean } = {}
  ) => {
    if (options.showLoader) setLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/messages?markRead=${markRead ? 'true' : 'false'}`, {
        cache: 'no-store',
      })
      const payload = (await response.json()) as { messages?: ChatMessage[]; unreadCount?: number; error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load messages')
      }
      mergeMessages(payload.messages ?? [])
      onUnreadCountChange?.(payload.unreadCount ?? 0)
    } catch (error) {
      if (!options.silent) {
        toast.error(error instanceof Error ? error.message : 'Failed to load messages')
      }
    } finally {
      if (options.showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    if (active) {
      shouldStickToBottomRef.current = true
      scrollToBottomAfterPaint('auto')
    }
    const timer = window.setTimeout(() => {
      void loadMessages(active, { showLoader: true })
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, active])

  useEffect(() => {
    const channel = supabase
      .channel(`project-chat-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void loadMessages(active, { silent: true })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, active])

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      scrollToBottomAfterPaint('auto')
    }
  }, [sortedMessages, active, scrollToBottomAfterPaint])

  useEffect(() => {
    if (!loading) {
      scrollToBottomAfterPaint('auto')
    }
  }, [loading, active, scrollToBottomAfterPaint])

  useEffect(() => {
    if (!active) return
    const intervalId = window.setInterval(() => {
      void loadMessages(true, { silent: true })
    }, 2500)
    return () => window.clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, projectId])

  const sendTextMessage = async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, messageType: 'text' }),
      })
      const payload = (await response.json()) as { error?: string; message?: ChatMessage }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to send message')
      }
      if (payload.message) {
        mergeMessages([
          {
            ...payload.message,
            senderName: currentUserName,
          },
        ])
        window.requestAnimationFrame(() => scrollToBottom('smooth'))
      }
      setInput('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const uploadAndSendPhoto = async (file: File) => {
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await fetch('/api/upload/photo', { method: 'POST', body: formData })
      const uploadPayload = (await uploadRes.json()) as { url?: string; error?: string }
      if (!uploadRes.ok || !uploadPayload.url) {
        throw new Error(uploadPayload.error ?? 'Image upload failed')
      }

      const sendRes = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '',
          messageType: 'photo',
          attachmentUrls: [uploadPayload.url],
        }),
      })
      const sendPayload = (await sendRes.json()) as { error?: string; message?: ChatMessage }
      if (!sendRes.ok) {
        throw new Error(sendPayload.error ?? 'Failed to send image message')
      }
      if (sendPayload.message) {
        mergeMessages([
          {
            ...sendPayload.message,
            senderName: currentUserName,
          },
        ])
        window.requestAnimationFrame(() => scrollToBottom('smooth'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send image')
    } finally {
      setUploadingImage(false)
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendTextMessage()
    }
  }

  const overLimitCount = input.length > 800

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#E8DDD4] bg-[#F2EDE8]">
      <div
        ref={messagesContainerRef}
        style={{ overflowAnchor: 'none' }}
        onScroll={(event) => {
          const node = event.currentTarget
          const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
          shouldStickToBottomRef.current = distanceFromBottom < 80
        }}
        className="flex-1 space-y-1 overflow-y-auto p-4 pb-24"
      >
        {loading ? (
          <div className="space-y-3">
            <div className="h-14 w-2/3 animate-pulse rounded-2xl rounded-tl-sm bg-gray-200" />
            <div className="ml-auto h-14 w-2/3 animate-pulse rounded-2xl rounded-tr-sm bg-orange-200" />
            <div className="h-14 w-2/3 animate-pulse rounded-2xl rounded-tl-sm bg-gray-200" />
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-14 text-center">
            <MessageCircle className="h-12 w-12 text-gray-300" />
            <p className="mt-2 text-base font-semibold text-gray-500">No messages yet</p>
            <p className="mt-1 text-sm text-gray-400">Send a message to start the conversation</p>
          </div>
        ) : (
          sortedMessages.map((message, index) => {
            const own = message.senderId === currentUserId
            const previous = sortedMessages[index - 1]
            const showSender = !previous || previous.senderId !== message.senderId
            const dateChanged =
              !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()

            return (
              <div key={message.id}>
                {dateChanged ? (
                  <div className="my-3 text-center">
                  <span className="mx-auto inline-flex rounded-full bg-[#E8DDD4] px-3 py-1 text-[10px] text-[#78716C]">
                      {dateSeparatorLabel(message.createdAt)}
                    </span>
                  </div>
                ) : null}

                {!own && showSender ? (
                  <p className="mb-1 ml-10 text-[10px] text-[#A8A29E]">{message.senderName}</p>
                ) : null}

                <div className={`flex items-end gap-2 ${own ? 'justify-end' : 'justify-start'}`}>
                  {!own && showSender ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700">
                      {initials(message.senderName)}
                    </div>
                  ) : !own ? (
                    <div className="w-7" />
                  ) : null}

                  <div className={`max-w-[75%] ${own ? 'items-end' : 'items-start'} flex flex-col`}>
                    {message.messageType === 'photo' && message.attachmentUrls[0] ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(message.attachmentUrls[0])}
                        className="overflow-hidden rounded-xl"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.attachmentUrls[0]}
                          alt="Shared image"
                          className="max-h-56 w-[200px] rounded-xl object-cover"
                        />
                      </button>
                    ) : (
                      <div
                        className={`px-3.5 py-2.5 text-[13px] shadow-sm ${
                          own
                            ? 'rounded-tl-[18px] rounded-tr-[18px] rounded-bl-[18px] rounded-br-[2px] bg-[#D85A30] text-white shadow-[0_4px_12px_rgba(216,90,48,0.28)]'
                            : 'rounded-tl-[18px] rounded-tr-[18px] rounded-bl-[2px] rounded-br-[18px] border border-[#E8DDD4] bg-white text-[#2C2C2A] shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                        }`}
                      >
                        {message.content}
                      </div>
                    )}

                    <p className={`mt-1 text-[9px] ${own ? 'mr-1 text-[#A8A29E]' : 'ml-10 text-[#A8A29E]'}`}>
                      {formatMessageTime(message.createdAt)}
                      {own ? (
                        <span className="ml-1 inline-flex items-center text-orange-200">
                          <Check className="h-[10px] w-[10px]" />
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {previewImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 z-10 rounded-full bg-white/90 p-1 text-gray-700"
              aria-label="Close image preview"
            >
              <X className="h-4 w-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImage} alt="Full screen message image" className="max-h-[90vh] rounded-lg object-contain" />
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-0 border-t border-[#E8DDD4] bg-white p-2">
        <div className="w-full">
          {overLimitCount ? (
            <p className="mb-1 text-right text-xs text-gray-400">{input.length}/1000</p>
          ) : null}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F2EDE8] text-[#78716C]"
              aria-label="Attach image"
            >
              <span className="text-base">📎</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadAndSendPhoto(file)
                event.currentTarget.value = ''
              }}
            />
            <textarea
              value={input}
              maxLength={1000}
              rows={1}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Message..."
              className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border-none bg-[#F2EDE8] px-4 py-2.5 text-[13px] text-[#2C2C2A] outline-none"
            />
            <button
              type="button"
              onClick={() => void sendTextMessage()}
              disabled={!input.trim() || sending}
              className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full ${
                !input.trim() || sending ? 'bg-gray-300' : 'bg-[#D85A30] shadow-[0_4px_10px_rgba(216,90,48,0.35)]'
              } text-white`}
              aria-label="Send"
            >
              <span className="text-base">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
