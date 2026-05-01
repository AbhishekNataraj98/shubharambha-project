'use client'

import { useMemo, useRef, useState } from 'react'

type ProfessionalImage = {
  id: string
  image_url: string
  created_at: string
}

const MAX_IMAGES = 6

export default function ProfessionalImagesManager({
  initialItems,
  canEdit,
  embedded,
  neutralTiles,
  galleryHeading,
  noOuterChrome,
}: {
  initialItems: ProfessionalImage[]
  canEdit: boolean
  /** When true, render only the grid + modal (parent supplies outer frame/header). */
  embedded?: boolean
  /** Softer borders/fills for public profile cards */
  neutralTiles?: boolean
  /** Replaces default "PROFILE IMAGES" label */
  galleryHeading?: string
  /** Omit default section frame — parent supplies card border */
  noOuterChrome?: boolean
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<ProfessionalImage[]>(initialItems)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null)

  const canAdd = useMemo(() => items.length < MAX_IMAGES, [items.length])

  const onPickImage = async (file: File | null) => {
    if (!file) return
    if (!canAdd) {
      window.alert('6 images limit reached delete existing to upload new')
      return
    }
    try {
      setBusy(true)
      setMessage(null)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'professional-gallery')
      const uploadRes = await fetch('/api/upload/photo', { method: 'POST', body: formData })
      const uploadBody = (await uploadRes.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!uploadRes.ok || !uploadBody.url) throw new Error(uploadBody.error ?? 'Upload failed')

      const saveRes = await fetch('/api/profile/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: uploadBody.url }),
      })
      const saveBody = (await saveRes.json().catch(() => ({}))) as {
        error?: string
        item?: ProfessionalImage
      }
      if (!saveRes.ok || !saveBody.item) throw new Error(saveBody.error ?? 'Unable to save image')

      setItems((prev) => [...prev, saveBody.item as ProfessionalImage])
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to upload image')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (id: string) => {
    try {
      setBusy(true)
      setMessage(null)
      const response = await fetch(`/api/profile/images/${id}`, { method: 'DELETE' })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Unable to delete image')
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to delete image')
    } finally {
      setBusy(false)
    }
  }

  const tileWrap =
    neutralTiles
      ? 'relative aspect-square overflow-hidden rounded-[10px] border border-[#E8DDD4] bg-[#F2EDE8]'
      : 'relative aspect-square overflow-hidden rounded-xl border border-orange-100 bg-orange-50'

  const inner = (
    <>
      {!embedded ? (
        <div
          className={`mb-3 flex items-center justify-between ${noOuterChrome ? 'border-b border-[#F2EDE8] pb-3' : ''}`}
        >
          <p className="text-[9px] font-bold tracking-[0.06em]" style={{ color: '#A8A29E' }}>
            {galleryHeading ?? 'PROFILE IMAGES'}
          </p>
          {canEdit ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void onPickImage(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => {
                  if (!canAdd) {
                    window.alert('6 images limit reached delete existing to upload new')
                    return
                  }
                  fileRef.current?.click()
                }}
                disabled={busy}
                className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                style={{
                  border: '1px solid #FED7AA',
                  backgroundColor: '#FFF7ED',
                  color: '#C2410C',
                }}
              >
                + Add image
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <div key={item.id} className={tileWrap}>
            <button
              type="button"
              onClick={() => setActiveImageUrl(item.image_url)}
              className="h-full w-full"
              aria-label="Preview image"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image_url} alt="Professional work" className="h-full w-full object-cover" />
            </button>
            {canEdit ? (
              <button
                type="button"
                onClick={() => void onDelete(item.id)}
                disabled={busy}
                className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs font-bold text-white disabled:opacity-60"
                aria-label="Delete image"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {canEdit && !embedded
          ? Array.from({ length: Math.max(0, MAX_IMAGES - items.length) }).map((_, index) => (
              <div
                key={`slot-${index}`}
                className="flex aspect-square items-center justify-center rounded-xl border border-orange-200 bg-orange-50/40"
              >
                <span className="text-[11px] font-semibold text-orange-300">{`Image ${items.length + index + 1}`}</span>
              </div>
            ))
          : null}
      </div>
      {!canEdit && items.length === 0 ? (
        <p className={`text-sm ${embedded ? '' : 'mt-2'}`} style={{ color: '#7A6F66' }}>
          No profile images yet.
        </p>
      ) : null}

      {canEdit ? (
        <p className="mt-3 text-[11px]" style={{ color: '#9CA3AF' }}>
          {`${items.length}/${MAX_IMAGES} images used`}
        </p>
      ) : embedded ? (
        <p className="mt-2 text-[9px]" style={{ color: '#78716C' }}>
          {`${items.length}/${MAX_IMAGES} images`}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs" style={{ color: '#6B7280' }}>
          {message}
        </p>
      ) : null}
      {activeImageUrl ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActiveImageUrl(null)}
        >
          <div className="relative w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeImageUrl} alt="Preview" className="max-h-[85vh] w-full rounded-2xl object-contain" />
            <button
              type="button"
              onClick={() => setActiveImageUrl(null)}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-lg text-white"
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
    </>
  )

  if (embedded) return inner

  if (noOuterChrome) {
    return <div className="space-y-3">{inner}</div>
  }

  return (
    <section className="mb-6 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      {inner}
    </section>
  )
}
