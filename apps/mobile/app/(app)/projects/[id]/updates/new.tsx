import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'
import { uploadPhotoToWebApi } from '@/lib/uploadPhoto'
import { KeyboardSafeView } from '@/lib/keyboardSafe'
import { SafeAreaView } from 'react-native-safe-area-context'

type ConstructionStage = 'foundation' | 'plinth' | 'walls' | 'slab' | 'plastering' | 'finishing'

const STAGE_OPTIONS: Array<{ value: ConstructionStage; label: string; emoji: string }> = [
  { value: 'foundation', label: 'Foundation', emoji: '🏗' },
  { value: 'plinth', label: 'Plinth', emoji: '📐' },
  { value: 'walls', label: 'Walls', emoji: '🧱' },
  { value: 'slab', label: 'Slab', emoji: '🏛' },
  { value: 'plastering', label: 'Plastering', emoji: '🎨' },
  { value: 'finishing', label: 'Finishing', emoji: '✨' },
]

type PickedPhoto = { uri: string; name: string; type: string }

export default function PostUpdateScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [blockedCustomer, setBlockedCustomer] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [hideStageAndMaterials, setHideStageAndMaterials] = useState(false)
  const [stageTag, setStageTag] = useState<ConstructionStage | null>(null)
  const [description, setDescription] = useState('')
  const [materialsUsed, setMaterialsUsed] = useState('')
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [progressText, setProgressText] = useState('')

  useEffect(() => {
    const checkAccess = async () => {
      if (!projectId) {
        setAuthChecked(true)
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setAuthChecked(true)
        return
      }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
      if (!profile) {
        setAuthChecked(true)
        return
      }
      if (profile.role === 'customer') {
        setBlockedCustomer(true)
        setAuthChecked(true)
        return
      }
      const { data: project } = await supabase
        .from('projects')
        .select('id,contractor_id,customer_id,current_stage')
        .eq('id', projectId)
        .maybeSingle()
      if (!project) {
        setAuthChecked(true)
        return
      }
      const isDirectMember = project.contractor_id === user.id || project.customer_id === user.id
      if (!isDirectMember) {
        const { data: membership } = await supabase
          .from('project_members')
          .select('id')
          .eq('project_id', projectId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (!membership) {
          setAuthChecked(true)
          return
        }
      }
      const projectStage = (project.current_stage as ConstructionStage | null) ?? 'foundation'
      setStageTag(projectStage)
      setHideStageAndMaterials(profile.role === 'worker' && !project.contractor_id)
      setAllowed(true)
      setAuthChecked(true)
    }
    void checkAccess()
  }, [projectId])

  const canSubmit = Boolean(stageTag && photos.length > 0 && description.trim().length >= 10)

  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission', 'Please allow photo library access.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    })
    if (result.canceled) return
    const next: PickedPhoto[] = result.assets
      .map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? `photo-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      }))
      .slice(0, Math.max(0, 10 - photos.length))
    setPhotos((prev) => [...prev, ...next].slice(0, 10))
  }

  const removePhotoAt = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const submitUpdate = async () => {
    if (!canSubmit || submitting || !projectId || !stageTag) return
    setSubmitting(true)
    setProgressText('')
    try {
      const uploadedUrls: string[] = []
      for (let i = 0; i < photos.length; i += 1) {
        setProgressText(`Uploading photos ${i + 1}/${photos.length}…`)
        const url = await uploadPhotoToWebApi({
          uri: photos[i].uri,
          name: photos[i].name,
          type: photos[i].type,
          folder: 'shubharambha/updates',
        })
        uploadedUrls.push(url)
      }
      setProgressText('Saving update…')
      const payload = await apiPost<{ success?: boolean; error?: string }>(`/api/projects/${projectId}/updates/create`, {
        stage_tag: stageTag,
        description: description.trim(),
        photo_urls: uploadedUrls,
        materials_used: materialsUsed.trim() || undefined,
      })
      if (!payload.success) throw new Error(payload.error ?? 'Failed to post update')
      Alert.alert('Posted', 'Update posted!')
      router.back()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
    } finally {
      setSubmitting(false)
      setProgressText('')
    }
  }

  const charStyle = useMemo(() => (description.length > 400 ? '#D85A30' : '#9CA3AF'), [description.length])

  if (!projectId) return null

  if (blockedCustomer) {
    return <Redirect href={{ pathname: '/projects/[id]', params: { id: projectId } }} />
  }

  if (!authChecked) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['left', 'right']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#D85A30" />
        </View>
      </SafeAreaView>
    )
  }

  if (!allowed) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['left', 'right']}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#6B7280' }}>Access denied</Text>
        </View>
      </SafeAreaView>
    )
  }

  const BRAND = '#D85A30'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['left', 'right']}>
      <KeyboardSafeView includeTopSafeArea={false} iosHeaderOffset={52}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#F2EDE8',
          }}
        >
          <Pressable onPress={() => router.back()} style={{ padding: 8 }} accessibilityLabel="Back">
            <Text style={{ fontSize: 22, color: '#374151' }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Post Update</Text>
          <TouchableOpacity
            onPress={() => void submitUpdate()}
            disabled={!canSubmit || submitting}
            style={{ padding: 8, minWidth: 48, minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: canSubmit && !submitting ? BRAND : '#D1D5DB' }}>Post</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {!hideStageAndMaterials ? (
            <>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 8 }}>{"Today's construction stage *"}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {STAGE_OPTIONS.map((s) => {
                  const selected = stageTag === s.value
                  return (
                    <TouchableOpacity
                      key={s.value}
                      onPress={() => setStageTag(s.value)}
                      style={{
                        minHeight: 48,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: selected ? BRAND : '#E5E7EB',
                        backgroundColor: selected ? BRAND : '#FFFFFF',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontWeight: '600', color: selected ? '#FFFFFF' : '#4B5563' }}>
                        {s.emoji} {s.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </>
          ) : null}

          <Text style={{ fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 8 }}>Photos * (at least 1)</Text>
          {photos.length === 0 ? (
            <Pressable
              onPress={() => void pickPhotos()}
              style={{
                borderWidth: 2,
                borderColor: '#E5E7EB',
                borderStyle: 'dashed',
                borderRadius: 16,
                padding: 32,
                alignItems: 'center',
                backgroundColor: '#F9FAFB',
              }}
            >
              <Text style={{ fontSize: 36 }}>📷</Text>
              <Text style={{ marginTop: 8, fontWeight: '600', color: '#4B5563' }}>Tap to add photos</Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: '#9CA3AF' }}>JPG, PNG up to 5MB each</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`} style={{ width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' }}>
                  <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <Pressable
                    onPress={() => removePhotoAt(index)}
                    style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2 }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 10 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
              {photos.length < 10 ? (
                <Pressable
                  onPress={() => void pickPhotos()}
                  style={{
                    width: '31%',
                    aspectRatio: 1,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: '#E5E7EB',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#F9FAFB',
                  }}
                >
                  <Text style={{ fontSize: 24, color: '#6B7280' }}>+</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          <Text style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>{photos.length} / 10 photos</Text>

          <Text style={{ fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 8 }}>What did you accomplish today? *</Text>
          <TextInput
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, 500))}
            multiline
            maxLength={500}
            placeholder={'Describe today\'s work…'}
            style={{
              minHeight: 120,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              borderRadius: 12,
              padding: 12,
              fontSize: 14,
              textAlignVertical: 'top',
              backgroundColor: '#F9FAFB',
            }}
          />
          <Text style={{ textAlign: 'right', marginTop: 4, fontSize: 12, color: charStyle }}>
            {description.length} / 500
          </Text>

          {!hideStageAndMaterials ? (
            <>
              <Text style={{ fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8 }}>Materials used (optional)</Text>
              <TextInput
                value={materialsUsed}
                onChangeText={(t) => setMaterialsUsed(t.slice(0, 200))}
                maxLength={200}
                placeholder="e.g. 50 bags OPC cement"
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, minHeight: 48, backgroundColor: '#F9FAFB' }}
              />
            </>
          ) : null}

          <TouchableOpacity
            onPress={() => void submitUpdate()}
            disabled={!canSubmit || submitting}
            style={{
              marginTop: 24,
              minHeight: 52,
              borderRadius: 16,
              backgroundColor: canSubmit && !submitting ? BRAND : '#D1D5DB',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>{submitting ? 'Posting…' : 'Post Update'}</Text>
          </TouchableOpacity>
          {progressText ? <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: '#6B7280' }}>{progressText}</Text> : null}
        </ScrollView>
      </KeyboardSafeView>
    </SafeAreaView>
  )
}
