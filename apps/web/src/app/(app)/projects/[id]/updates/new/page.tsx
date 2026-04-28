'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Camera, ChevronLeft, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Enums } from '@/types/supabase'

const stageOptions: Array<{ value: Enums<'construction_stage'>; label: string }> = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'plinth', label: 'Plinth' },
  { value: 'walls', label: 'Walls' },
  { value: 'slab', label: 'Slab' },
  { value: 'plastering', label: 'Plastering' },
  { value: 'finishing', label: 'Finishing' },
]

type SelectedPhoto = {
  file: File
  previewUrl: string
}

export default function PostUpdatePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [authChecked, setAuthChecked] = useState(false)
  const [hideStageAndMaterials, setHideStageAndMaterials] = useState(false)
  const [stageTag, setStageTag] = useState<Enums<'construction_stage'> | null>(null)
  const [description, setDescription] = useState('')
  const [materialsUsed, setMaterialsUsed] = useState('')
  const [photos, setPhotos] = useState<SelectedPhoto[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [progressText, setProgressText] = useState('')

  useEffect(() => {
    const checkAccess = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
      if (!profile) {
        router.replace('/dashboard')
        return
      }
      if (profile.role === 'customer') {
        router.replace(`/projects/${projectId}`)
        return
      }

      const { data: project } = await supabase
        .from('projects')
        .select('id,contractor_id,customer_id,current_stage')
        .eq('id', projectId)
        .maybeSingle()
      if (!project) {
        router.replace('/dashboard')
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
          router.replace('/dashboard')
          return
        }
      }
      setStageTag((project.current_stage as Enums<'construction_stage'> | null) ?? 'foundation')
      setHideStageAndMaterials(profile.role === 'worker' && !project.contractor_id)
      setAuthChecked(true)
    }
    void checkAccess()
  }, [projectId, router, supabase])

  const canSubmit = Boolean(stageTag && photos.length > 0 && description.trim().length >= 10)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const incoming = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, Math.max(0, 10 - photos.length))
      .map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }))
    if (incoming.length === 0) return
    setPhotos((prev) => [...prev, ...incoming].slice(0, 10))
  }

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((_, idx) => idx !== index)
    })
  }

  useEffect(() => {
    return () => {
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    }
  }, [photos])

  const submitUpdate = async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setProgressText('')
    try {
      const uploadedUrls: string[] = []
      for (let index = 0; index < photos.length; index += 1) {
        setProgressText(`Uploading photos ${index + 1}/${photos.length}...`)
        const formData = new FormData()
        formData.append('file', photos[index].file)
        formData.append('folder', 'shubharambha/updates')
        const uploadResponse = await fetch('/api/upload/photo', { method: 'POST', body: formData })
        const uploadPayload = (await uploadResponse.json()) as { url?: string; error?: string }
        if (!uploadResponse.ok || !uploadPayload.url) {
          throw new Error(uploadPayload.error ?? 'Upload failed')
        }
        uploadedUrls.push(uploadPayload.url)
      }

      setProgressText('Saving update...')
      const response = await fetch(`/api/projects/${projectId}/updates/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_tag: stageTag,
          description: description.trim(),
          photo_urls: uploadedUrls,
          materials_used: materialsUsed.trim() || undefined,
        }),
      })
      const payload = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Failed to post update')
      }
      toast.success('Update posted!')
      router.push(`/projects/${projectId}?tab=updates`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to post update')
    } finally {
      setSubmitting(false)
      setProgressText('')
    }
  }

  const charCountClass = useMemo(() => {
    if (description.length > 400) return 'text-xs text-orange-500'
    return 'text-xs text-gray-400'
  }, [description.length])

  if (!authChecked) {
    return <div className="mx-auto max-w-md p-6 text-sm text-gray-500">Loading...</div>
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-white px-4 pb-24">
      <header className="sticky top-0 z-20 -mx-4 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href={`/projects/${projectId}`} className="rounded-full p-2 hover:bg-gray-100" aria-label="Back">
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </Link>
          <h1 className="text-base font-semibold text-gray-900">Post Update</h1>
          <button
            type="button"
            onClick={() => void submitUpdate()}
            disabled={!canSubmit || submitting}
            className={`text-sm font-semibold ${canSubmit && !submitting ? 'text-orange-500' : 'text-gray-300'}`}
          >
            Post
          </button>
        </div>
      </header>

      {!hideStageAndMaterials ? (
        <section className="mt-5">
          <p className="mb-2 text-sm font-medium text-gray-900">Today&apos;s construction stage *</p>
          <div className="flex flex-wrap gap-2">
            {stageOptions.map((stage) => {
              const selected = stageTag === stage.value
              return (
                <button
                  key={stage.value}
                  type="button"
                  onClick={() => setStageTag(stage.value)}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    selected
                      ? 'border-orange-500 bg-orange-500 font-medium text-white'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  {stage.label}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <p className="mb-2 text-sm font-medium text-gray-900">Photos * (at least 1 required)</p>
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center"
          >
            <Camera className="mx-auto h-10 w-10 text-orange-400" />
            <p className="mt-2 font-medium text-gray-600">Tap to add photos</p>
            <p className="mt-1 text-xs text-gray-400">JPG, PNG up to 5MB each</p>
          </button>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <div key={`${photo.previewUrl}-${index}`} className="relative aspect-square overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.previewUrl} alt="Selected update photo" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < 10 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50"
                  aria-label="Add more photos"
                >
                  <Plus className="h-5 w-5 text-gray-500" />
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-gray-500">{photos.length} photos selected</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files)
            event.currentTarget.value = ''
          }}
        />
      </section>

      <section className="mt-6">
        <p className="mb-2 text-sm font-medium text-gray-900">What did you accomplish today? *</p>
        <textarea
          rows={4}
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={`Describe today's work in detail...\n\nExample: Completed the brickwork for the north and east walls. Used M-grade mortar mix. Work is curing overnight.`}
          className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none focus:border-orange-400"
        />
        <p className={`mt-1 text-right ${charCountClass}`}>{description.length} / 500</p>
      </section>

      {!hideStageAndMaterials ? (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900">Materials used today</p>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Optional</span>
          </div>
          <input
            value={materialsUsed}
            maxLength={200}
            onChange={(event) => setMaterialsUsed(event.target.value)}
            placeholder="e.g. 50 bags OPC cement, 2 tons TMT steel"
            className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-orange-400"
          />
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => void submitUpdate()}
        disabled={!canSubmit || submitting}
        className={`mt-8 flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold text-white ${
          !canSubmit || submitting ? 'bg-gray-300' : 'bg-orange-500'
        }`}
      >
        {submitting ? 'Posting...' : 'Post Update'}
      </button>
      {submitting && progressText ? <p className="mt-2 text-center text-xs text-gray-500">{progressText}</p> : null}
    </div>
  )
}
