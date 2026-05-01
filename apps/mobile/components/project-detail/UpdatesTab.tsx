import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { dateLabelForFeed, getInitials, relativeTime } from '@/lib/utils'
import { ProjectHeroAndStage } from '@/components/project-detail/ProjectChrome'
import { KeyboardSafeView } from '@/lib/keyboardSafe'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DetailTab, FeedbackState, UpdateItem } from '@/components/project-detail/types'

const BRAND = '#D85A30'

function formatDateEntry(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
  })
}

function stageEmoji(stage: string): string {
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

type UpdatesTabProps = {
  projectId: string
  currentUserId: string
  currentUserRole: string
  contractorName: string
  focusUpdateId?: string
  activeTab: DetailTab
  onTabChange: (t: DetailTab) => void
  listHeaderProps: {
    projectName: string
    address: string
    city: string
    status: string
    currentStage: string
    customerName: string
    contractorName: string
    professionalName?: string
    professionalRole?: 'worker' | 'contractor' | null
    onPressProfessional?: () => void
    onPressProjectImages?: () => void
    onPressProjectOverview?: () => void
    contractorAssigned?: boolean
    hideStageTracker?: boolean
    showReportsTab?: boolean
  }
}

type Row = { kind: 'date'; label: string; key: string } | { kind: 'update'; item: UpdateItem; key: string }

export function UpdatesTab({
  projectId,
  currentUserId,
  currentUserRole,
  contractorName,
  focusUpdateId,
  activeTab,
  onTabChange,
  listHeaderProps,
}: UpdatesTabProps) {
  const insets = useSafeAreaInsets()
  const channelSuffixRef = useRef(Math.random().toString(36).slice(2))
  const [updates, setUpdates] = useState<UpdateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [viewer, setViewer] = useState<{ photos: string[]; index: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UpdateItem | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [feedbackByUpdate, setFeedbackByUpdate] = useState<Record<string, FeedbackState>>({})
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({})
  const [commentDraftByUpdate, setCommentDraftByUpdate] = useState<Record<string, string>>({})
  const [replyTargetByUpdate, setReplyTargetByUpdate] = useState<Record<string, string | null>>({})
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const listRef = useRef<FlatList<Row>>(null)
  const hasFocusedRef = useRef(false)
  const [highlightedUpdateId, setHighlightedUpdateId] = useState<string | null>(null)

  const canPost = currentUserRole === 'contractor' || currentUserRole === 'worker'

  const loadUpdates = useCallback(
    async (opts: { showLoader?: boolean; silent?: boolean } = {}) => {
      if (opts.showLoader) setLoading(true)
      try {
        const payload = await apiGet<{ updates?: UpdateItem[]; error?: string }>(`/api/projects/${projectId}/updates`)
        setUpdates(payload.updates ?? [])
      } catch (e) {
        if (!opts.silent) Alert.alert('Updates', e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (opts.showLoader) setLoading(false)
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
        const payload = await apiGet<{ feedback?: Record<string, FeedbackState>; error?: string }>(
          `/api/projects/${projectId}/updates/feedback?ids=${query}`
        )
        setFeedbackByUpdate(payload.feedback ?? {})
      } catch (e) {
        Alert.alert('Feedback', e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setFeedbackLoading(false)
      }
    },
    [projectId]
  )

  useEffect(() => {
    void loadUpdates({ showLoader: true })
  }, [loadUpdates])

  useEffect(() => {
    const ids = updates.map((u) => u.id)
    if (ids.length === 0) return
    const t = setTimeout(() => void loadFeedback(ids), 0)
    return () => clearTimeout(t)
  }, [updates, loadFeedback])

  useEffect(() => {
    const updatesChannelName = `updates:${projectId}:${channelSuffixRef.current}`
    const channel = supabase
      .channel(updatesChannelName)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'daily_updates', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const removedId = String((payload.old as { id?: string }).id ?? '')
          if (!removedId) return
          setUpdates((prev) => prev.filter((item) => item.id !== removedId))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'daily_updates', filter: `project_id=eq.${projectId}` },
        async (payload) => {
          const postedBy = String((payload.new as { posted_by?: string }).posted_by ?? '')
          const updateId = String((payload.new as { id?: string }).id ?? '')
          if (!updateId || postedBy === currentUserId) return
          try {
            const json = await apiGet<{ update?: UpdateItem }>(
              `/api/projects/${projectId}/updates?updateId=${encodeURIComponent(updateId)}`
            )
            if (json.update) prependById(json.update)
          } catch {
            void loadUpdates({ silent: true })
          }
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, loadUpdates, prependById, projectId])

  useEffect(() => {
    if (updates.length === 0) return
    const updateIds = updates.map((item) => item.id)
    const refreshFeedback = () => void loadFeedback(updateIds)
    const feedbackChannelName = `updates-feedback:${projectId}:${channelSuffixRef.current}`
    const feedbackChannel = supabase
      .channel(feedbackChannelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'update_likes' }, (payload) => {
        const nextRow = payload.new as Record<string, unknown> | null
        const oldRow = payload.old as Record<string, unknown> | null
        const updateId = String(nextRow?.update_id ?? oldRow?.update_id ?? '')
        if (!updateId || !updateIds.includes(updateId)) return
        refreshFeedback()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'update_comments' }, (payload) => {
        const nextRow = payload.new as Record<string, unknown> | null
        const oldRow = payload.old as Record<string, unknown> | null
        const updateId = String(nextRow?.update_id ?? oldRow?.update_id ?? '')
        if (!updateId || !updateIds.includes(updateId)) return
        refreshFeedback()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(feedbackChannel)
    }
  }, [loadFeedback, projectId, updates])

  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    updates.forEach((item, index) => {
      const previous = updates[index - 1]
      const showDate =
        !previous || new Date(previous.createdAt).toDateString() !== new Date(item.createdAt).toDateString()
      if (showDate) {
        out.push({ kind: 'date', label: dateLabelForFeed(item.createdAt), key: `d-${item.id}` })
      }
      out.push({ kind: 'update', item, key: item.id })
    })
    return out
  }, [updates])

  useEffect(() => {
    if (!focusUpdateId || hasFocusedRef.current || rows.length === 0) return
    const targetIndex = rows.findIndex((row) => row.kind === 'update' && row.item.id === focusUpdateId)
    if (targetIndex < 0) return
    hasFocusedRef.current = true
    setHighlightedUpdateId(focusUpdateId)
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.2 })
    }, 120)
  }, [focusUpdateId, rows])

  useEffect(() => {
    if (!highlightedUpdateId) return
    const t = setTimeout(() => setHighlightedUpdateId(null), 2200)
    return () => clearTimeout(t)
  }, [highlightedUpdateId])

  const onRefresh = async () => {
    setRefreshing(true)
    await loadUpdates({ silent: true })
    const ids = updates.map((u) => u.id)
    if (ids.length) await loadFeedback(ids)
    setRefreshing(false)
  }

  const deleteUpdate = async () => {
    if (!deleteTarget || deleteLoading) return
    setDeleteLoading(true)
    try {
      await apiDelete(`/api/projects/${projectId}/updates/${deleteTarget.id}`)
      setUpdates((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      await loadUpdates({ silent: true })
      setDeleteTarget(null)
    } catch (e) {
      Alert.alert('Delete', e instanceof Error ? e.message : 'Failed')
    } finally {
      setDeleteLoading(false)
    }
  }

  const toggleLike = async (updateId: string) => {
    try {
      const payload = await apiPost<{
        success?: boolean
        error?: string
        liked?: boolean
        likesCount?: number
      }>(`/api/projects/${projectId}/updates/${updateId}/like`, {})
      if (!payload.success) throw new Error(payload.error ?? 'Failed')
      setFeedbackByUpdate((prev) => ({
        ...prev,
        [updateId]: {
          likesCount: payload.likesCount ?? prev[updateId]?.likesCount ?? 0,
          likedByCurrentUser: payload.liked ?? false,
          comments: prev[updateId]?.comments ?? [],
        },
      }))
    } catch (e) {
      Alert.alert('Like', e instanceof Error ? e.message : 'Failed')
    }
  }

  const submitComment = async (updateId: string) => {
    const content = (commentDraftByUpdate[updateId] ?? '').trim()
    if (!content) return
    try {
      const payload = await apiPost<{ success?: boolean; error?: string }>(
        `/api/projects/${projectId}/updates/${updateId}/comments`,
        { content, parentCommentId: replyTargetByUpdate[updateId] ?? undefined }
      )
      if (!payload.success) throw new Error(payload.error ?? 'Failed')
      setCommentDraftByUpdate((prev) => ({ ...prev, [updateId]: '' }))
      setReplyTargetByUpdate((prev) => ({ ...prev, [updateId]: null }))
      await loadFeedback([updateId])
    } catch (e) {
      Alert.alert('Comment', e instanceof Error ? e.message : 'Failed')
    }
  }

  const listHeader = (
    <View>
      <ProjectHeroAndStage
        projectName={listHeaderProps.projectName}
        address={listHeaderProps.address}
        city={listHeaderProps.city}
        status={listHeaderProps.status}
        currentStage={listHeaderProps.currentStage}
        customerName={listHeaderProps.customerName}
        contractorName={listHeaderProps.contractorName}
        professionalName={listHeaderProps.professionalName}
        professionalRole={listHeaderProps.professionalRole}
        onPressProfessional={listHeaderProps.onPressProfessional}
      onPressProjectImages={listHeaderProps.onPressProjectImages}
        onPressProjectOverview={listHeaderProps.onPressProjectOverview}
        contractorAssigned={listHeaderProps.contractorAssigned}
        hideStageTracker={listHeaderProps.hideStageTracker}
        showReportsTab={listHeaderProps.showReportsTab}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
    </View>
  )

  if (loading) {
    return (
      <View style={{ flex: 1, paddingTop: 24 }}>
        {listHeader}
        <ActivityIndicator color={BRAND} style={{ marginTop: 24 }} />
      </View>
    )
  }

  return (
    <KeyboardSafeView
      includeTopSafeArea={false}
      iosKeyboardOffsetOverride={Platform.OS === 'ios' ? insets.top + 8 : undefined}
    >
    <View style={{ flex: 1 }}>
      {listHeader}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={BRAND} />}
        contentContainerStyle={{ paddingBottom: 120 }}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 })
          }, 250)
        }}
        renderItem={({ item }) => {
          if (item.kind === 'date') {
            return (
              <View style={{ alignItems: 'center', marginVertical: 10 }}>
                <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#E5E7EB' }}>
                  <Text style={{ fontSize: 11, color: '#6B7280' }}>{item.label}</Text>
                </View>
              </View>
            )
          }
          const u = item.item
          const fb = feedbackByUpdate[u.id]
          const isHighlighted = highlightedUpdateId === u.id
          return (
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <View
                style={{
                  borderRadius: 16,
                  backgroundColor: '#FFFFFF',
                  overflow: 'hidden',
                  borderWidth: isHighlighted ? 2 : 0.5,
                  borderColor: isHighlighted ? '#D85A30' : '#E8DDD4',
                }}
              >
                <View
                  style={{
                    backgroundColor: '#2C2C2A',
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>
                    {'📝 ' + formatDateEntry(u.createdAt)}
                  </Text>
                  <View style={{ backgroundColor: 'rgba(216,90,48,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#D85A30', textTransform: 'capitalize' }}>
                      {stageEmoji(u.stageTag)} {u.stageTag}
                    </Text>
                  </View>
                </View>
                <View style={{ padding: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 50,
                        backgroundColor: '#D85A30',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
                        {getInitials(u.posterName || contractorName)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#2C2C2A' }}>{u.posterName || contractorName}</Text>
                      <Text style={{ fontSize: 9, color: '#A8A29E', marginTop: 1 }}>
                        Contractor · {relativeTime(u.createdAt)}
                      </Text>
                    </View>
                    {canPost && u.postedBy === currentUserId ? (
                      <TouchableOpacity onPress={() => setDeleteTarget(u)} hitSlop={12}>
                        <Text style={{ fontSize: 14, color: '#EF4444' }}>🗑</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {u.photoUrls.length > 0 ? (
                    u.photoUrls.length === 1 ? (
                      <TouchableOpacity
                        onPress={() => setViewer({ photos: u.photoUrls, index: 0 })}
                        style={{ height: 140, borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}
                      >
                        <Image source={{ uri: u.photoUrls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
                        {u.photoUrls.slice(0, 3).map((url, idx) => (
                          <TouchableOpacity
                            key={`${u.id}-p-${idx}`}
                            onPress={() => setViewer({ photos: u.photoUrls, index: idx })}
                            style={{ flex: 1, height: 80, borderRadius: 8, overflow: 'hidden' }}
                          >
                            <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            {idx === 2 && u.photoUrls.length > 3 ? (
                              <View
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  right: 0,
                                  bottom: 0,
                                  left: 0,
                                  backgroundColor: 'rgba(0,0,0,0.5)',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>+{u.photoUrls.length - 3}</Text>
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )
                  ) : null}
                  <Text style={{ fontSize: 13, color: '#78716C', lineHeight: 20, fontStyle: 'italic' }}>&quot;{u.description}&quot;</Text>
                  {u.materialsUsed ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 8,
                        backgroundColor: '#F2EDE8',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text style={{ fontSize: 10 }}>🧱</Text>
                      <Text style={{ fontSize: 10, color: '#78716C' }}>{u.materialsUsed}</Text>
                    </View>
                  ) : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      marginTop: 10,
                      paddingTop: 10,
                      borderTopWidth: 0.5,
                      borderTopColor: '#F2EDE8',
                    }}
                  >
                    <TouchableOpacity onPress={() => void toggleLike(u.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 14 }}>{fb?.likedByCurrentUser ? '❤️' : '🤍'}</Text>
                      <Text style={{ fontSize: 11, color: fb?.likedByCurrentUser ? '#D85A30' : '#A8A29E', fontWeight: '600' }}>
                        {fb?.likesCount ?? 0}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setExpandedComments((prev) => ({ ...prev, [u.id]: !prev[u.id] }))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Text style={{ fontSize: 14 }}>💬</Text>
                      <Text style={{ fontSize: 11, color: '#A8A29E', fontWeight: '600' }}>
                        {fb?.comments?.length ?? 0} comments
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {expandedComments[u.id] ? (
                    <View style={{ marginTop: 10, borderRadius: 12, padding: 10, backgroundColor: '#F9FAFB' }}>
                      {feedbackLoading ? (
                        <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</Text>
                      ) : (
                        <>
                          {(fb?.comments ?? []).map((c) => (
                            <View key={c.id} style={{ marginBottom: 8, borderRadius: 10, padding: 8, backgroundColor: '#FFFFFF' }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>{c.userName}</Text>
                              <Text style={{ fontSize: 12, color: '#4B5563', marginTop: 2 }}>{c.content}</Text>
                              <TouchableOpacity onPress={() => setReplyTargetByUpdate((prev) => ({ ...prev, [u.id]: c.id }))}>
                                <Text style={{ fontSize: 11, color: BRAND, marginTop: 4 }}>Reply</Text>
                              </TouchableOpacity>
                              {c.replies.map((r) => (
                                <View key={r.id} style={{ marginTop: 6, marginLeft: 8, padding: 6, backgroundColor: '#F2EDE8', borderRadius: 6 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '600' }}>{r.userName}</Text>
                                  <Text style={{ fontSize: 11, color: '#4B5563' }}>{r.content}</Text>
                                </View>
                              ))}
                            </View>
                          ))}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <TextInput
                              value={commentDraftByUpdate[u.id] ?? ''}
                              onChangeText={(t) => setCommentDraftByUpdate((prev) => ({ ...prev, [u.id]: t }))}
                              placeholder={replyTargetByUpdate[u.id] ? 'Reply…' : 'Add feedback…'}
                              style={{ flex: 1, borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 8, fontSize: 12 }}
                            />
                            <TouchableOpacity
                              onPress={() => void submitComment(u.id)}
                              style={{ borderRadius: 999, backgroundColor: BRAND, paddingHorizontal: 14, justifyContent: 'center', minHeight: 48 }}
                            >
                              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 12 }}>Post</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          )
        }}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#4B5563' }}>{canPost ? 'Share your first update' : 'No updates yet'}</Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
              {canPost ? "Tap + to post today's progress" : 'Contractor will post daily progress here'}
            </Text>
          </View>
        }
      />

      {canPost ? (
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/projects/[id]/updates/new', params: { id: projectId } })}
          style={{
            position: 'absolute',
            right: 20,
            bottom: 28,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: BRAND,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 4,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
          }}
          accessibilityLabel="Post update"
        >
          <Text style={{ fontSize: 28, color: '#FFFFFF', fontWeight: '300' }}>+</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 16 }}>
          <TouchableOpacity style={{ position: 'absolute', top: 48, right: 16, zIndex: 2, padding: 8 }} onPress={() => setViewer(null)}>
            <Text style={{ color: '#FFFFFF', fontSize: 22 }}>✕</Text>
          </TouchableOpacity>
          {viewer ? (
            <>
              <Image source={{ uri: viewer.photos[viewer.index] }} style={{ width: '100%', height: '70%' }} resizeMode="contain" />
              <Text style={{ textAlign: 'center', color: '#FFFFFF', marginTop: 12 }}>
                {viewer.index + 1} / {viewer.photos.length}
              </Text>
              {viewer.photos.length > 1 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                  <TouchableOpacity
                    onPress={() => setViewer((v) => (v ? { ...v, index: (v.index - 1 + v.photos.length) % v.photos.length } : v))}
                    style={{ padding: 12 }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 24 }}>‹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setViewer((v) => (v ? { ...v, index: (v.index + 1) % v.photos.length } : v))}
                    style={{ padding: 12 }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 24 }}>›</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </Modal>

      <Modal visible={Boolean(deleteTarget)} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}>
          <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Delete update?</Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: '#6B7280' }}>This will permanently remove this update.</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <TouchableOpacity onPress={() => setDeleteTarget(null)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}>
                <Text style={{ color: '#4B5563' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void deleteUpdate()}
                disabled={deleteLoading}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#EF4444', borderRadius: 10 }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{deleteLoading ? '…' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </KeyboardSafeView>
  )
}
