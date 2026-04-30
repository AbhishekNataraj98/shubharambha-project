'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type ProjectImage = {
  id: string
  projectId: string
  imageUrl: string
  uploadedBy: string
  uploaderName: string
  createdAt: string
}

type ProjectImagesPayload = {
  images?: ProjectImage[]
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

const CUSTOMER_LOCK_MESSAGE = '7 threshold limit reached, customer can upload only after deleting existing image'
const PROFESSIONAL_LOCK_MESSAGE = '20 threshold limit reached, contractor/worker can upload only after deleting existing image'
const TOTAL_LOCK_MESSAGE = '27 threshold limit reached, upload only after deleting existing image'

export default function ProjectImagesPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const [images, setImages] = useState<ProjectImage[]>([])
  const [counts, setCounts] = useState({ customer: 0, professional: 0, total: 0 })
  const [limits, setLimits] = useState({ customer: 7, professional: 20, total: 27 })

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true)
      try {
        const response = await fetch(`/api/projects/${projectId}/images`, { cache: 'no-store' })
        const payload = (await response.json()) as ProjectImagesPayload
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load images')
        }
        setImages(payload.images ?? [])
        if (payload.counts) setCounts(payload.counts)
        if (payload.limits) setLimits(payload.limits)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load images')
      } finally {
        if (!opts.silent) setLoading(false)
      }
    },
    [projectId]
  )

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
      setProfileRole(profile?.role ?? null)
      await load()
    }
    void init()
  }, [load, router, supabase])

  const isCustomer = profileRole === 'customer'
  const isProfessional = profileRole === 'contractor' || profileRole === 'worker'
  const canUpload = isCustomer || isProfessional
  const reachedTotalThreshold = counts.total >= limits.total
  const reachedRoleThreshold = isCustomer
    ? counts.customer >= limits.customer
    : isProfessional
      ? counts.professional >= limits.professional
      : false
  const reachedThreshold = reachedTotalThreshold || reachedRoleThreshold

  const uploadLabel = useMemo(() => {
    if (uploading) return 'Uploading...'
    if (reachedThreshold) {
      if (isCustomer) return `Upload Locked (${counts.customer}/${limits.customer})`
      if (isProfessional) return `Upload Locked (${counts.professional}/${limits.professional})`
      return 'Upload Locked'
    }
    return isCustomer ? 'Upload Customer Images' : 'Upload Contractor/Worker Images'
  }, [counts.customer, counts.professional, isCustomer, isProfessional, limits.customer, limits.professional, reachedThreshold, uploading])

  const onUploadClick = () => {
    if (!canUpload) {
      toast.error('Only customer/contractor/worker can upload project images')
      return
    }
    if (reachedThreshold) {
      toast.error(reachedTotalThreshold ? TOTAL_LOCK_MESSAGE : isCustomer ? CUSTOMER_LOCK_MESSAGE : PROFESSIONAL_LOCK_MESSAGE)
      return
    }
    fileInputRef.current?.click()
  }

  const onFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    if (!fileList || fileList.length === 0) return
    const roleRemaining = isCustomer
      ? Math.max(0, limits.customer - counts.customer)
      : isProfessional
        ? Math.max(0, limits.professional - counts.professional)
        : 0
    const totalRemaining = Math.max(0, limits.total - counts.total)
    const remaining = Math.min(roleRemaining, totalRemaining)
    if (remaining <= 0) {
      toast.error(reachedTotalThreshold ? TOTAL_LOCK_MESSAGE : isCustomer ? CUSTOMER_LOCK_MESSAGE : PROFESSIONAL_LOCK_MESSAGE)
      return
    }

    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/')).slice(0, remaining)
    if (files.length === 0) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i += 1) {
        const form = new FormData()
        form.append('file', files[i])
        form.append('folder', 'shubharambha/project-images')
        const uploadResponse = await fetch('/api/upload/photo', { method: 'POST', body: form })
        const uploadPayload = (await uploadResponse.json()) as { url?: string; error?: string }
        if (!uploadResponse.ok || !uploadPayload.url) {
          throw new Error(uploadPayload.error ?? 'Image upload failed')
        }

        const saveResponse = await fetch(`/api/projects/${projectId}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: uploadPayload.url }),
        })
        const savePayload = (await saveResponse.json()) as { error?: string }
        if (!saveResponse.ok) {
          throw new Error(savePayload.error ?? 'Failed to save image')
        }
      }
      toast.success('Project images uploaded')
      await load({ silent: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload image(s)')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const onDelete = async (imageId: string) => {
    setDeletingId(imageId)
    try {
      const response = await fetch(`/api/projects/${projectId}/images/${imageId}`, { method: 'DELETE' })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Failed to delete image')
      setImages((prev) => prev.filter((img) => img.id !== imageId))
      setCounts((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }))
      await load({ silent: true })
      toast.success('Image deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete image')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <div className="mx-auto min-h-screen w-full max-w-md bg-[#FFF7F3] p-4 text-sm text-gray-500">Loading images...</div>
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-[#FFF7F3] pb-24">
      <header className="sticky top-0 z-20 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link href={`/projects/${projectId}`} className="rounded-full p-2 hover:bg-gray-100" aria-label="Back to project">
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </Link>
          <h1 className="text-base font-bold text-gray-900">Project Images</h1>
        </div>
      </header>

      <section className="mx-4 mt-3 rounded-2xl border border-orange-200 bg-white p-4">
        <h2 className="text-2xl font-extrabold text-gray-900">Project Images</h2>
        <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${reachedThreshold ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {counts.total}/{limits.total} images uploaded
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Customer: {counts.customer}/{limits.customer} • Contractor/Worker: {counts.professional}/{limits.professional}
        </p>
      </section>

      {images.length === 0 ? (
        <div className="mx-4 mt-10 rounded-2xl border border-dashed border-orange-200 bg-white p-8 text-center">
          <p className="text-5xl">🖼️</p>
          <p className="mt-3 text-lg font-semibold text-gray-900">Start your visual gallery</p>
          <p className="mt-1 text-sm text-gray-500">Upload photos to track project progress.</p>
        </div>
      ) : (
        <div className="mx-3 mt-3 grid grid-cols-2 gap-3">
          {images.map((image) => {
            const canDelete =
              userId === image.uploadedBy || profileRole === 'customer' || profileRole === 'contractor'
            return (
              <div key={image.id} className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                <img src={image.imageUrl} alt="Project upload" className="h-40 w-full object-cover" />
                <div className="p-2">
                  <p className="truncate text-xs font-semibold text-gray-700">{image.uploaderName}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {new Date(image.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => void onDelete(image.id)}
                    disabled={deletingId === image.id}
                    className="m-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white hover:bg-black"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === image.id ? 'Deleting...' : 'Delete'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <div className="fixed bottom-4 left-1/2 w-full max-w-md -translate-x-1/2 px-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void onFilesSelected(e)}
        />
        <button
          type="button"
          onClick={onUploadClick}
          disabled={uploading}
          className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-xl text-sm font-extrabold text-white shadow-lg ${
            reachedThreshold ? 'bg-gray-400' : 'bg-[#D85A30] hover:bg-orange-600'
          }`}
        >
          <ImagePlus className="h-4 w-4" />
          {uploadLabel}
        </button>
      </div>
    </div>
  )
}
