import { useCallback, useEffect, useMemo, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSessionState } from '@/lib/auth-state'
import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { uploadPhotoToWebApi } from '@/lib/uploadPhoto'

const BRAND = '#D85A30'
const CUSTOMER_LOCK_MESSAGE = '7 threshold limit reached, customer can upload only after deleting existing image'
const PROFESSIONAL_LOCK_MESSAGE = '20 threshold limit reached, contractor/worker can upload only after deleting existing image'
const TOTAL_LOCK_MESSAGE = '27 threshold limit reached, upload only after deleting existing image'
const REQUEST_TIMEOUT_MS = 30000
const UPLOAD_STUCK_RESET_MS = 90000

type ProjectImageItem = {
  id: string
  projectId: string
  imageUrl: string
  uploadedBy: string
  uploaderName: string
  createdAt: string
}

type ProjectImagesPayload = {
  images?: ProjectImageItem[]
  actorRole?: string | null
  counts?: {
    customer: number
    professional: number
    total: number
  }
  limits?: {
    customer: number
    professional: number
    total: number
  }
  error?: string
}

export default function ProjectImagesScreen() {
  const { id: rawProjectId } = useLocalSearchParams<{ id: string }>()
  const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId
  const { user, profile, loading: authLoading } = useSessionState()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null)
  const [lastUploadError, setLastUploadError] = useState<string | null>(null)
  const [images, setImages] = useState<ProjectImageItem[]>([])
  const [limits, setLimits] = useState({ customer: 7, professional: 20, total: 27 })
  const [counts, setCounts] = useState({ customer: 0, professional: 0, total: 0 })

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      })
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }, [])

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!projectId) return
    if (!opts.silent) setLoading(true)
    try {
      const payload = await apiGet<ProjectImagesPayload>(`/api/projects/${projectId}/images`)
      setImages(payload.images ?? [])
      if (payload.limits) setLimits(payload.limits)
      if (payload.counts) setCounts(payload.counts)
    } catch (error) {
      Alert.alert('Project images', error instanceof Error ? error.message : 'Failed to load images')
    } finally {
      if (!opts.silent) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!uploading || !uploadStartedAt) return
    const elapsed = Date.now() - uploadStartedAt
    const remaining = Math.max(0, UPLOAD_STUCK_RESET_MS - elapsed)
    const timer = setTimeout(() => {
      setUploading(false)
      setUploadStartedAt(null)
      Alert.alert(
        'Upload reset',
        'Upload was taking too long, so it was reset. Please check network connection and try again.'
      )
    }, remaining)
    return () => clearTimeout(timer)
  }, [uploadStartedAt, uploading])

  const onRefresh = async () => {
    setRefreshing(true)
    await load({ silent: true })
    setRefreshing(false)
  }

  const uploaderRole = profile?.role
  const isCustomer = uploaderRole === 'customer'
  const isProfessional = uploaderRole === 'contractor' || uploaderRole === 'worker'
  const canUpload = isCustomer || isProfessional
  const reachedTotalThreshold = counts.total >= limits.total
  const reachedRoleThreshold = isCustomer
    ? counts.customer >= limits.customer
    : isProfessional
      ? counts.professional >= limits.professional
      : false
  const reachedThreshold = reachedTotalThreshold || reachedRoleThreshold
  const lockMessage = reachedTotalThreshold
    ? TOTAL_LOCK_MESSAGE
    : isCustomer
      ? CUSTOMER_LOCK_MESSAGE
      : PROFESSIONAL_LOCK_MESSAGE
  const uploadButtonLabel = isCustomer
    ? 'Upload Customer Images'
    : isProfessional
      ? 'Upload Contractor/Worker Images'
      : 'Upload Project Images'

  const onUpload = async () => {
    if (!canUpload) {
      Alert.alert('Upload not allowed', 'Only customer/contractor/worker can upload project images.')
      return
    }
    if (reachedThreshold) {
      Alert.alert('Upload locked', lockMessage)
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to upload images.')
      return
    }

    const roleRemaining = isCustomer
      ? Math.max(0, limits.customer - counts.customer)
      : isProfessional
        ? Math.max(0, limits.professional - counts.professional)
        : 0
    const totalRemaining = Math.max(0, limits.total - counts.total)
    const remaining = Math.min(roleRemaining, totalRemaining)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: Math.min(remaining, 20),
    })
    if (result.canceled || !result.assets.length) return

    const selectedAssets = result.assets.slice(0, remaining)
    setUploading(true)
    setUploadStartedAt(Date.now())
    setLastUploadError(null)
    try {
      for (let i = 0; i < selectedAssets.length; i += 1) {
        const asset = selectedAssets[i]
        const imageUrl = await withTimeout(
          uploadPhotoToWebApi({
            uri: asset.uri,
            name: asset.fileName ?? `project-image-${Date.now()}-${i}.jpg`,
            type: asset.mimeType ?? 'image/jpeg',
            folder: 'shubharambha/project-images',
          }),
          REQUEST_TIMEOUT_MS,
          'Image upload timed out. Please check network and try again.'
        )
        await withTimeout(
          apiPost(`/api/projects/${projectId}/images`, { image_url: imageUrl }),
          REQUEST_TIMEOUT_MS,
          'Saving uploaded image timed out. Please check network and try again.'
        )
      }
      await load({ silent: true })
      Alert.alert('Uploaded', 'Project images updated successfully.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload image(s).'
      const friendly =
        /network request failed/i.test(message)
          ? 'Network request failed. Make sure your phone and API server are reachable on the same network, then try again.'
          : message
      setLastUploadError(friendly)
      Alert.alert('Upload failed', friendly)
    } finally {
      setUploading(false)
      setUploadStartedAt(null)
    }
  }

  const deleteImage = async (item: ProjectImageItem) => {
    Alert.alert('Delete image?', 'This will remove the image from project gallery.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiDelete(`/api/projects/${projectId}/images/${item.id}`)
            setImages((prev) => prev.filter((img) => img.id !== item.id))
          } catch (error) {
            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete image.')
          }
        },
      },
    ])
  }

  const titleText = useMemo(() => {
    if (images.length === 0) return 'No project images yet'
    return `${counts.total}/${limits.total} images uploaded`
  }, [counts.total, images.length, limits.total])

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={['left', 'right', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />
  if (!projectId) return null

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={['left', 'right', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF7F3' }} edges={['left', 'right', 'bottom']}>
      <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: '#FED7AA' }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>Project Images</Text>
        <View style={{ marginTop: 12, alignSelf: 'flex-start', borderRadius: 999, backgroundColor: reachedThreshold ? '#FEE2E2' : '#ECFDF3', paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontWeight: '700', fontSize: 12, color: reachedThreshold ? '#991B1B' : '#166534' }}>{titleText}</Text>
        </View>
        <Text style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
          Customer: {counts.customer}/{limits.customer} • Contractor/Worker: {counts.professional}/{limits.professional}
        </Text>
      </View>

      <FlatList
        data={images}
        keyExtractor={(item) => item.id}
        numColumns={2}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={BRAND} />}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 14, paddingBottom: 130 }}
        columnWrapperStyle={{ gap: 10 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={{ marginTop: 52, alignItems: 'center', paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 52 }}>🖼️</Text>
            <Text style={{ marginTop: 10, fontSize: 18, fontWeight: '700', color: '#1F2937' }}>Start your visual gallery</Text>
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 }}>
              Upload site photos to keep all stakeholders updated with real progress.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const canDelete = user.id === item.uploadedBy || profile?.role === 'customer' || profile?.role === 'contractor'
          return (
            <View style={{ flex: 1, borderRadius: 16, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: '#F2EDE8' }}>
              <Image source={{ uri: item.imageUrl }} style={{ width: '100%', height: 156 }} resizeMode="cover" />
              <View style={{ padding: 10 }}>
                <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>
                  {item.uploaderName}
                </Text>
                <Text style={{ marginTop: 4, fontSize: 11, color: '#9CA3AF' }}>
                  {new Date(item.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              {canDelete ? (
                <TouchableOpacity
                  onPress={() => deleteImage(item)}
                  style={{ position: 'absolute', top: 8, right: 8, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        }}
      />

      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
        <TouchableOpacity
          onPress={() => void onUpload()}
          disabled={uploading}
          activeOpacity={0.9}
          style={{
            minHeight: 56,
            borderRadius: 16,
            backgroundColor: reachedThreshold ? '#9CA3AF' : BRAND,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 3,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>
            {uploading
              ? 'Uploading...'
              : reachedThreshold
                ? isCustomer
                  ? `Upload Locked (${counts.customer}/${limits.customer})`
                  : isProfessional
                    ? `Upload Locked (${counts.professional}/${limits.professional})`
                    : 'Upload Locked'
                : uploadButtonLabel}
          </Text>
        </TouchableOpacity>
        {lastUploadError ? (
          <TouchableOpacity
            onPress={() => void onUpload()}
            disabled={uploading}
            style={{ marginTop: 10, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', backgroundColor: '#FFF1F2', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '700' }}>
              Retry Upload
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
