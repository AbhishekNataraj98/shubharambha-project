import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { apiGet, apiPost } from '@/lib/api'
import { chatDateSeparatorLabel, formatMessageTime, getInitials } from '@/lib/utils'
import { uploadPhotoToWebApi } from '@/lib/uploadPhoto'
import { ProjectHeroAndStage } from '@/components/project-detail/ProjectChrome'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ChatMessage, DetailTab } from '@/components/project-detail/types'

const BRAND = '#D85A30'

type ChatTabProps = {
  projectId: string
  currentUserId: string
  currentUserName: string
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

export function ChatTab({ projectId, currentUserId, currentUserName, activeTab, onTabChange, listHeaderProps }: ChatTabProps) {
  const insets = useSafeAreaInsets()
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const channelSuffixRef = useRef(Math.random().toString(36).slice(2))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const listRef = useRef<FlatList<ChatMessage>>(null)

  const sortedAsc = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  )

  const mergeMessages = useCallback(
    (incoming: ChatMessage[]) => {
      setMessages((previous) => {
        const byId = new Map<string, ChatMessage>()
        for (const item of previous) byId.set(item.id, item)
        for (const item of incoming) {
          byId.set(item.id, {
            ...item,
            senderName: item.senderName || (item.senderId === currentUserId ? currentUserName : 'User'),
          })
        }
        return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      })
    },
    [currentUserId, currentUserName]
  )

  const loadMessages = useCallback(
    async (markRead: boolean, opts: { showLoader?: boolean; silent?: boolean } = {}) => {
      if (opts.showLoader) setLoading(true)
      try {
        const payload = await apiGet<{ messages?: ChatMessage[]; unreadCount?: number; error?: string }>(
          `/api/projects/${projectId}/messages?markRead=${markRead ? 'true' : 'false'}`
        )
        mergeMessages(payload.messages ?? [])
      } catch (e) {
        if (!opts.silent) Alert.alert('Chat', e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (opts.showLoader) setLoading(false)
      }
    },
    [mergeMessages, projectId]
  )

  useEffect(() => {
    void loadMessages(activeTab === 'chat', { showLoader: true })
  }, [activeTab, loadMessages, projectId])

  useEffect(() => {
    const channelName = `project-chat-${projectId}-${channelSuffixRef.current}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
        () => {
          void loadMessages(activeTab === 'chat', { silent: true })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeTab, loadMessages, projectId])

  useEffect(() => {
    if (activeTab !== 'chat') return
    const intervalId = setInterval(() => {
      void loadMessages(true, { silent: true })
    }, 2500)
    return () => clearInterval(intervalId)
  }, [activeTab, loadMessages, projectId])

  useEffect(() => {
    if (activeTab !== 'chat') {
      setKeyboardHeight(0)
      return
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = (e: { endCoordinates: { height: number } }) => setKeyboardHeight(e.endCoordinates.height)
    const onHide = () => setKeyboardHeight(0)
    const subShow = Keyboard.addListener(showEvt, onShow)
    const subHide = Keyboard.addListener(hideEvt, onHide)
    return () => {
      subShow.remove()
      subHide.remove()
    }
  }, [activeTab])

  useEffect(() => {
    if (!loading && sortedAsc.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [loading, sortedAsc.length])

  useEffect(() => {
    if (keyboardHeight > 0 && activeTab === 'chat') {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
    }
  }, [keyboardHeight, activeTab])

  const sendTextMessage = async () => {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    try {
      const payload = await apiPost<{ error?: string; message?: ChatMessage }>(`/api/projects/${projectId}/messages`, {
        content,
        messageType: 'text',
      })
      if (payload.message) {
        mergeMessages([{ ...payload.message, senderName: currentUserName }])
        setInput('')
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
      } else if (payload.error) {
        throw new Error(payload.error)
      }
    } catch (e) {
      Alert.alert('Send', e instanceof Error ? e.message : 'Failed')
    } finally {
      setSending(false)
    }
  }

  const uploadAndSendPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission', 'Photos required to attach images.')
      return
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
    if (picked.canceled || !picked.assets[0]) return
    const asset = picked.assets[0]
    setUploadingImage(true)
    try {
      const uri = asset.uri
      const name = uri.split('/').pop() ?? 'photo.jpg'
      const type = asset.mimeType ?? 'image/jpeg'
      const url = await uploadPhotoToWebApi({ uri, name, type })
      const payload = await apiPost<{ error?: string; message?: ChatMessage }>(`/api/projects/${projectId}/messages`, {
        content: '',
        messageType: 'photo',
        attachmentUrls: [url],
      })
      if (payload.message) {
        mergeMessages([{ ...payload.message, senderName: currentUserName }])
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
      } else if (payload.error) throw new Error(payload.error)
    } catch (e) {
      Alert.alert('Image', e instanceof Error ? e.message : 'Failed')
    } finally {
      setUploadingImage(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadMessages(true, { silent: true })
    setRefreshing(false)
  }

  const chrome = (
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
  )

  if (loading) {
    return (
      <View style={{ flex: 1, paddingTop: 24 }}>
        {chrome}
        <ActivityIndicator color={BRAND} style={{ marginTop: 24 }} />
      </View>
    )
  }

  // iOS: lift composer by measured keyboard height. Android: rely on `softwareKeyboardLayoutMode: resize` so we
  // only apply safe-area bottom; adding keyboard height there would double-shift with window resize.
  const composerBottomPad =
    Platform.OS === 'ios' ? (keyboardHeight > 0 ? keyboardHeight : insets.bottom) : insets.bottom

  return (
    <View style={{ flex: 1, backgroundColor: '#F2EDE8' }}>
      {chrome}
      <FlatList
        ref={listRef}
        data={sortedAsc}
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={BRAND} />}
        contentContainerStyle={{ paddingBottom: 16, paddingHorizontal: 12, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#6B7280' }}>No messages yet</Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: '#9CA3AF' }}>Send a message to start the conversation</Text>
          </View>
        }
        renderItem={({ item: message, index }) => {
          const own = message.senderId === currentUserId
          const previous = sortedAsc[index - 1]
          const showSender = !previous || previous.senderId !== message.senderId
          const dateChanged =
            !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
          return (
            <View>
              {dateChanged ? (
                <View style={{ alignItems: 'center', marginVertical: 10 }}>
                  <View style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3, backgroundColor: '#E8DDD4' }}>
                    <Text style={{ fontSize: 10, color: '#78716C' }}>{chatDateSeparatorLabel(message.createdAt)}</Text>
                  </View>
                </View>
              ) : null}
              {!own && showSender ? (
                <Text style={{ fontSize: 10, color: '#A8A29E', marginBottom: 3, marginLeft: 36, textAlign: 'left' }}>
                  {message.senderName}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: own ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end' }}>
                {!own && showSender ? (
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#374151' }}>{getInitials(message.senderName)}</Text>
                  </View>
                ) : !own ? (
                  <View style={{ width: 28, marginRight: 8 }} />
                ) : null}
                <View style={{ maxWidth: '75%', alignItems: own ? 'flex-end' : 'flex-start' }}>
                  {message.messageType === 'photo' && message.attachmentUrls[0] ? (
                    <TouchableOpacity onPress={() => setPreviewImage(message.attachmentUrls[0])}>
                      <Image source={{ uri: message.attachmentUrls[0] }} style={{ width: 200, maxHeight: 220, borderRadius: 12 }} resizeMode="cover" />
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={{
                        borderTopLeftRadius: 18,
                        borderTopRightRadius: 18,
                        borderBottomRightRadius: own ? 2 : 18,
                        borderBottomLeftRadius: own ? 18 : 2,
                        paddingHorizontal: 13,
                        paddingVertical: 9,
                        backgroundColor: own ? BRAND : '#FFFFFF',
                        borderWidth: own ? 0 : 0.5,
                        borderColor: '#E8DDD4',
                        shadowColor: own ? '#D85A30' : '#000000',
                        shadowOpacity: own ? 0.3 : 0.04,
                        shadowRadius: own ? 8 : 4,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: own ? 2 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 13, color: own ? '#FFFFFF' : '#2C2C2A' }}>{message.content}</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 9, color: '#A8A29E', marginTop: 3, textAlign: own ? 'right' : 'left' }}>
                    {formatMessageTime(message.createdAt)}
                  </Text>
                </View>
              </View>
            </View>
          )
        }}
      />
      <View
        style={{
          borderTopWidth: 0.5,
          borderTopColor: '#E8DDD4',
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 8,
          paddingTop: 8,
          paddingBottom: composerBottomPad,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <TouchableOpacity onPress={() => void uploadAndSendPhoto()} disabled={uploadingImage} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2EDE8', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16 }}>📎</Text>
        </TouchableOpacity>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Message…"
          maxLength={1000}
          multiline
          style={{ flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, backgroundColor: '#F2EDE8', paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: '#2C2C2A' }}
        />
        <TouchableOpacity
          onPress={() => void sendTextMessage()}
          disabled={!input.trim() || sending}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: !input.trim() || sending ? '#D1D5DB' : BRAND,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#D85A30',
            shadowOpacity: !input.trim() || sending ? 0 : 0.35,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: !input.trim() || sending ? 0 : 2,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16 }}>→</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={Boolean(previewImage)} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center' }} activeOpacity={1} onPress={() => setPreviewImage(null)}>
          {previewImage ? <Image source={{ uri: previewImage }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </TouchableOpacity>
      </Modal>
    </View>
  )
}
