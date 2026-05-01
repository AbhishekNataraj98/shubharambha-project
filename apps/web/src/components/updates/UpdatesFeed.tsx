'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type UpdateItem = {
  id: string
  projectId: string
  postedBy: string
  posterName: string
  description: string
  stageTag: string
  photoUrls: string[]
  materialsUsed: string | null
  createdAt: string
}

type UpdatesFeedProps = {
  projectId: string
  currentUserId: string
  currentUserRole: string
  contractorName: string
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function relativeTime(dateValue: string) {
  const diffMs = Date.now() - new Date(dateValue).getTime()
  const minutes = Math.floor(diffMs / (1000 * 60))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(dateValue).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function dateLabel(dateValue: string) {
  const date = new Date(dateValue)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })
}

function formatDateEntry(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
  })
}

function stageEmoji(stage: string) {
  const map: Record<string, string> = {
    foundation: '⛏️',
    plinth: '🏗️',
    walls: '🧱',
    slab: '🪨',
    plastering: '🖌️',
    finishing: '✨',
  }
  return map[stage] ?? '🏗️'
}

type ViewerState = {
  photos: string[]
  index: number
}

type FeedbackComment = {
  id: string
  updateId: string
  userId: string
  userName: string
  content: string
  createdAt: string
  parentCommentId: string | null
  replies: FeedbackComment[]
}

type FeedbackState = {
  likesCount: number
  likedByCurrentUser: boolean
  comments: FeedbackComment[]
}

export default function UpdatesFeed({
  projectId,
  currentUserId,
  currentUserRole,
  contractorName,
}: UpdatesFeedProps) {
  const searchParams = useSearchParams()
  const selectedUpdateId = searchParams.get('updateId')
  const storageKey = `updates-feed:${projectId}`
  const supabase = createClient()
  const updateRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [updates, setUpdates] = useState<UpdateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [cacheReady, setCacheReady] = useState(false)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UpdateItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [feedbackByUpdate, setFeedbackByUpdate] = useState<Record<string, FeedbackState>>({})
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({})
  const [commentDraftByUpdate, setCommentDraftByUpdate] = useState<Record<string, string>>({})
  const [replyTargetByUpdate, setReplyTargetByUpdate] = useState<Record<string, string | null>>({})
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [highlightedUpdateId, setHighlightedUpdateId] = useState<string | null>(null)
  const canPost = currentUserRole === 'contractor' || currentUserRole === 'worker'

  const loadUpdates = useCallback(
    async (options: { showLoader?: boolean; silent?: boolean } = {}) => {
      if (options.showLoader) setLoading(true)
      try {
        const response = await fetch(`/api/projects/${projectId}/updates`, { cache: 'no-store' })
        const payload = (await response.json()) as { updates?: UpdateItem[]; error?: string }
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load updates')
        setUpdates(payload.updates ?? [])
      } catch (error) {
        if (!options.silent) {
          toast.error(error instanceof Error ? error.message : 'Failed to load updates')
        }
      } finally {
        if (options.showLoader) setLoading(false)
      }
    },
    [projectId]
  )

  const prependById = useCallback((item: UpdateItem) => {
    setUpdates((prev) => {
      if (prev.some((entry) => entry.id === item.id)) return prev
      return [item, ...prev]
    })
  }, [])

  const loadFeedback = useCallback(
    async (updateIds: string[]) => {
      if (updateIds.length === 0) {
        setFeedbackByUpdate({})
        return
      }
      setFeedbackLoading(true)
      try {
        const query = encodeURIComponent(updateIds.join(','))
        const response = await fetch(`/api/projects/${projectId}/updates/feedback?ids=${query}`, {
          cache: 'no-store',
        })
        const payload = (await response.json()) as { feedback?: Record<string, FeedbackState>; error?: string }
        if (!response.ok) throw new Error(payload.error ?? 'Failed to load feedback')
        setFeedbackByUpdate(payload.feedback ?? {})
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load feedback')
      } finally {
        setFeedbackLoading(false)
      }
    },
    [projectId]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const timer = window.setTimeout(() => {
      try {
        const cached = window.sessionStorage.getItem(storageKey)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed)) {
            setUpdates(parsed as UpdateItem[])
            setLoading(false)
          }
        }
      } catch {
        // Ignore broken cache and continue.
      } finally {
        setCacheReady(true)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [storageKey])

  useEffect(() => {
    if (!cacheReady) return
    const timer = window.setTimeout(() => {
      void loadUpdates({
        showLoader: updates.length === 0,
        silent: updates.length > 0,
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [cacheReady, loadUpdates, updates.length])

  useEffect(() => {
    if (!cacheReady) return
    const ids = updates.map((item) => item.id)
    if (ids.length === 0) return
    const timer = window.setTimeout(() => {
      void loadFeedback(ids)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [cacheReady, loadFeedback, updates])

  useEffect(() => {
    if (!cacheReady) return
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(updates))
    } catch {
      // Ignore storage quota errors silently.
    }
  }, [cacheReady, storageKey, updates])

  useEffect(() => {
    const channel = supabase
      .channel(`updates:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'daily_updates',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const removedId = String(payload.old.id ?? '')
          if (!removedId) return
          setUpdates((prev) => prev.filter((item) => item.id !== removedId))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'daily_updates',
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          const postedBy = String(payload.new.posted_by ?? '')
          const updateId = String(payload.new.id ?? '')
          if (!updateId) return
          if (postedBy === currentUserId) return
          try {
            const response = await fetch(
              `/api/projects/${projectId}/updates?updateId=${encodeURIComponent(updateId)}`,
              { cache: 'no-store' }
            )
            const json = (await response.json()) as { update?: UpdateItem; error?: string }
            if (response.ok && json.update) {
              prependById(json.update)
            }
          } catch {
            // Fallback next polling cycle handles this.
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, prependById, projectId, supabase])

  useEffect(() => {
    if (updates.length === 0) return
    const updateIds = updates.map((item) => item.id)

    const refreshFeedback = () => {
      void loadFeedback(updateIds)
    }

    const feedbackChannel = supabase
      .channel(`updates-feedback:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'update_likes' },
        (payload) => {
          const nextRow = payload.new as Record<string, unknown> | null
          const oldRow = payload.old as Record<string, unknown> | null
          const updateId = String(nextRow?.update_id ?? oldRow?.update_id ?? '')
          if (!updateId || !updateIds.includes(updateId)) return
          refreshFeedback()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'update_comments' },
        (payload) => {
          const nextRow = payload.new as Record<string, unknown> | null
          const oldRow = payload.old as Record<string, unknown> | null
          const updateId = String(nextRow?.update_id ?? oldRow?.update_id ?? '')
          if (!updateId || !updateIds.includes(updateId)) return
          refreshFeedback()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(feedbackChannel)
    }
  }, [loadFeedback, projectId, supabase, updates])

  useEffect(() => {
    if (!selectedUpdateId || updates.length === 0) return
    const target = updateRefs.current[selectedUpdateId]
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedUpdateId(selectedUpdateId)
    const timer = window.setTimeout(() => setHighlightedUpdateId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [selectedUpdateId, updates])

  const updatesWithSeparators = useMemo(() => {
    return updates.map((item, index) => {
      const previous = updates[index - 1]
      const showDate =
        !previous ||
        new Date(previous.createdAt).toDateString() !== new Date(item.createdAt).toDateString()
      return { item, showDate }
    })
  }, [updates])

  const nextPhoto = () => {
    if (!viewer) return
    setViewer((prev) =>
      prev
        ? {
            ...prev,
            index: (prev.index + 1) % prev.photos.length,
          }
        : prev
    )
  }

  const prevPhoto = () => {
    if (!viewer) return
    setViewer((prev) =>
      prev
        ? {
            ...prev,
            index: (prev.index - 1 + prev.photos.length) % prev.photos.length,
          }
        : prev
    )
  }

  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const deleteUpdate = async () => {
    if (!deleteTarget || deleteLoading) return
    setDeleteLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/updates/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const payload = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Failed to delete update')
      }
      setUpdates((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      await loadUpdates({ silent: true })
      setDeleteTarget(null)
      toast.success('Update deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete update')
    } finally {
      setDeleteLoading(false)
    }
  }

  const toggleLike = async (updateId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/updates/${updateId}/like`, { method: 'POST' })
      const payload = (await response.json()) as {
        success?: boolean
        error?: string
        liked?: boolean
        likesCount?: number
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Failed to update like')
      }
      setFeedbackByUpdate((prev) => ({
        ...prev,
        [updateId]: {
          likesCount: payload.likesCount ?? prev[updateId]?.likesCount ?? 0,
          likedByCurrentUser: payload.liked ?? false,
          comments: prev[updateId]?.comments ?? [],
        },
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update like')
    }
  }

  const submitComment = async (updateId: string) => {
    const content = (commentDraftByUpdate[updateId] ?? '').trim()
    if (!content) return
    try {
      const response = await fetch(`/api/projects/${projectId}/updates/${updateId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          parentCommentId: replyTargetByUpdate[updateId] ?? undefined,
        }),
      })
      const payload = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Failed to post comment')
      }
      setCommentDraftByUpdate((prev) => ({ ...prev, [updateId]: '' }))
      setReplyTargetByUpdate((prev) => ({ ...prev, [updateId]: null }))
      await loadFeedback([updateId])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to post comment')
    }
  }

  return (
    <div className="space-y-3 bg-[#F2EDE8] pb-24">
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
              <div className="h-56 w-full bg-gray-100" />
              <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-orange-100" />
                <div className="space-y-1">
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-2.5 w-16 rounded bg-gray-100" />
                </div>
              </div>
              <div className="mt-3 h-3 w-40 rounded bg-gray-100" />
              <div className="mt-2 h-3 w-full rounded bg-gray-100" />
              <div className="mt-2 h-3 w-4/5 rounded bg-gray-100" />
              <div className="mt-3 flex gap-2">
                <div className="h-[90px] w-[90px] rounded-xl bg-gray-100" />
                <div className="h-[90px] w-[90px] rounded-xl bg-gray-100" />
                <div className="h-[90px] w-[90px] rounded-xl bg-gray-100" />
              </div>
              </div>
            </div>
          ))}
        </div>
      ) : updates.length === 0 ? (
        <div className="mt-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-orange-100 p-3 text-orange-500">
            <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor" aria-hidden="true">
              <path d="M3 13.5c0-2.8 2.2-5 5-5h8c2.8 0 5 2.2 5 5v3.5H3z" />
              <path d="M7.5 9.5a4.5 4.5 0 1 1 9 0h-2a2.5 2.5 0 1 0-5 0z" />
            </svg>
          </div>
          <p className="mt-3 font-medium text-gray-600">
            {canPost ? 'Share your first update' : 'No updates yet'}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {canPost ? "Tap + to post today's progress" : 'Contractor will post daily progress here'}
          </p>
        </div>
      ) : (
        updatesWithSeparators.map(({ item, showDate }) => {
          const visiblePhotos = item.photoUrls.slice(0, 3)
          const moreCount = Math.max(0, item.photoUrls.length - 3)
          return (
            <div
              key={item.id}
              ref={(node) => {
                updateRefs.current[item.id] = node
              }}
            >
              {showDate ? (
                <div className="my-3 text-center">
                  <span className="mx-auto inline-flex rounded-full bg-[#E8DDD4] px-3 py-1 text-[10px] text-[#78716C]">
                    {dateLabel(item.createdAt)}
                  </span>
                </div>
              ) : null}
              <div
                className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:shadow-md ${
                  highlightedUpdateId === item.id
                    ? 'border-[#D85A30] ring-2 ring-orange-200'
                    : 'border-[#E8DDD4]'
                }`}
              >
                <div className="flex items-center justify-between bg-[#2C2C2A] px-3.5 py-2.5">
                  <p className="text-[10px] font-bold text-white/85">{`📝 ${formatDateEntry(item.createdAt)}`}</p>
                  <span className="rounded-md bg-[rgba(216,90,48,0.25)] px-2 py-0.5 text-[9px] font-bold capitalize text-[#D85A30]">
                    {stageEmoji(item.stageTag)} {item.stageTag}
                  </span>
                </div>

                <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D85A30] text-[12px] font-semibold text-white">
                      {initials(item.posterName || contractorName)}
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[#2C2C2A]">{item.posterName || contractorName}</p>
                      <p className="text-[9px] text-[#A8A29E]">{`Contractor · ${relativeTime(item.createdAt)}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canPost && item.postedBy === currentUserId ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="rounded-full p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                        aria-label="Delete update"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <p className="mt-2 text-[13px] italic leading-relaxed text-[#78716C]">&quot;{item.description}&quot;</p>

                {item.photoUrls.length > 0 ? (
                  item.photoUrls.length === 1 ? (
                    <button
                      type="button"
                      onClick={() => setViewer({ photos: item.photoUrls, index: 0 })}
                      className="mt-3 block h-[140px] w-full overflow-hidden rounded-xl"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.photoUrls[0]} alt="Update photo" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                  <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
                    {visiblePhotos.map((url, index) => (
                      <button
                        key={`${item.id}-${index}`}
                        type="button"
                        className="relative shrink-0 overflow-hidden rounded-lg"
                        onClick={() => setViewer({ photos: item.photoUrls, index })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt="Update photo"
                          className="h-[80px] w-[92px] object-cover"
                        />
                        {index === 2 && moreCount > 0 ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white">
                            +{moreCount}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  )
                ) : null}

                {item.materialsUsed ? (
                  <div className="mt-2 inline-flex items-start gap-1 rounded-lg bg-[#F2EDE8] px-2.5 py-1.5 text-[10px] text-[#78716C]">
                    <span>🧱</span>
                    <span>Materials: {item.materialsUsed}</span>
                  </div>
                ) : null}

                <div className="mt-3 flex items-center gap-3 border-t border-[#F2EDE8] pt-2.5 text-gray-500">
                    <button
                      type="button"
                      onClick={() => void toggleLike(item.id)}
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[11px] transition hover:bg-gray-100 ${
                        feedbackByUpdate[item.id]?.likedByCurrentUser ? 'text-red-500' : ''
                      }`}
                    >
                      <span>{feedbackByUpdate[item.id]?.likedByCurrentUser ? '❤️' : '🤍'}</span>
                      <span>{feedbackByUpdate[item.id]?.likesCount ?? 0}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedComments((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                      }
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-[11px] transition hover:bg-gray-100"
                    >
                      <span>💬</span>
                      <span>{feedbackByUpdate[item.id]?.comments?.length ?? 0} comments</span>
                    </button>
                  </div>

                {expandedComments[item.id] ? (
                  <div className="mt-3 rounded-2xl bg-gray-50 p-3 ring-1 ring-gray-100">
                    {feedbackLoading ? (
                      <p className="text-xs text-gray-400">Loading comments...</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {(feedbackByUpdate[item.id]?.comments ?? []).map((comment) => (
                            <div key={comment.id} className="rounded-xl bg-white p-2 ring-1 ring-gray-100">
                              <p className="text-xs font-semibold text-gray-800">{comment.userName}</p>
                              <p className="mt-0.5 text-xs text-gray-600">{comment.content}</p>
                              <div className="mt-1 flex items-center gap-2">
                                <p className="text-[11px] text-gray-400">
                                  {new Date(comment.createdAt).toLocaleTimeString('en-IN', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReplyTargetByUpdate((prev) => ({ ...prev, [item.id]: comment.id }))
                                  }
                                  className="text-[11px] font-medium text-orange-600"
                                >
                                  Reply
                                </button>
                              </div>
                              {comment.replies.length > 0 ? (
                                <div className="mt-2 space-y-1 border-l border-gray-200 pl-2">
                                  {comment.replies.map((reply) => (
                                    <div key={reply.id} className="rounded-lg bg-gray-50 px-2 py-1">
                                      <p className="text-[11px] font-semibold text-gray-700">{reply.userName}</p>
                                      <p className="text-[11px] text-gray-600">{reply.content}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={commentDraftByUpdate[item.id] ?? ''}
                            onChange={(event) =>
                              setCommentDraftByUpdate((prev) => ({ ...prev, [item.id]: event.target.value }))
                            }
                            placeholder={
                              replyTargetByUpdate[item.id]
                                ? 'Write a reply...'
                                : 'Add feedback for this update...'
                            }
                            className="h-9 flex-1 rounded-full border border-gray-200 bg-white px-3 text-xs outline-none focus:border-orange-300"
                          />
                          <button
                            type="button"
                            onClick={() => void submitComment(item.id)}
                            className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Post
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          )
        })
      )}

      {canPost ? (
        <Link
          href={`/projects/${projectId}/updates/new`}
          className="fixed right-4 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition active:scale-95"
          aria-label="Post update"
        >
          <Plus className="h-6 w-6" />
        </Link>
      ) : null}

      {viewer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onTouchStart={(event) => {
            setTouchStartX(event.touches[0]?.clientX ?? null)
          }}
          onTouchEnd={(event) => {
            if (touchStartX === null) return
            const endX = event.changedTouches[0]?.clientX ?? touchStartX
            const delta = endX - touchStartX
            if (Math.abs(delta) > 50) {
              if (delta < 0) nextPhoto()
              if (delta > 0) prevPhoto()
            }
            setTouchStartX(null)
          }}
        >
          <button
            type="button"
            onClick={() => setViewer(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white"
            aria-label="Close viewer"
          >
            <X className="h-5 w-5" />
          </button>
          {viewer.photos.length > 1 ? (
            <button
              type="button"
              onClick={prevPhoto}
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewer.photos[viewer.index]}
            alt="Update photo preview"
            className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain"
          />
          {viewer.photos.length > 1 ? (
            <button
              type="button"
              onClick={nextPhoto}
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : null}
          <p className="absolute bottom-6 rounded-full bg-black/40 px-3 py-1 text-xs text-white">
            {viewer.index + 1} / {viewer.photos.length}
          </p>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Delete update?</h3>
            <p className="mt-1 text-sm text-gray-500">
              This will permanently remove this update from the project feed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteUpdate()}
                disabled={deleteLoading}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
