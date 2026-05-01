'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  role: string
  initialPhotoUrl: string
  initialCity: string
  initialPincode: string
  initialYearsExperience: number
  initialWorkerYearsExperience: number
  /** Hide centered toggle — use hero Edit/Cancel + panelOpen */
  hideToggleButton?: boolean
  panelOpen?: boolean
  onPanelOpenChange?: (open: boolean) => void
}

export default function ProfileEditForm(props: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const prevControlledOpen = useRef<boolean | undefined>(undefined)

  const isControlled = props.panelOpen !== undefined && props.onPanelOpenChange !== undefined
  const editingVisible = isControlled ? Boolean(props.panelOpen) : internalOpen

  const [photoUrl, setPhotoUrl] = useState(props.initialPhotoUrl)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)
  const [city, setCity] = useState(props.initialCity)
  const [pincode, setPincode] = useState(props.initialPincode)
  const [yearsExperience, setYearsExperience] = useState(
    String(props.role === 'worker' ? props.initialWorkerYearsExperience : props.initialYearsExperience || '')
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const resetDraft = () => {
    setPhotoUrl(props.initialPhotoUrl)
    setPendingPhotoFile(null)
    setCity(props.initialCity)
    setPincode(props.initialPincode)
    setYearsExperience(
      String(props.role === 'worker' ? props.initialWorkerYearsExperience : props.initialYearsExperience || '')
    )
    setMessage(null)
  }

  useEffect(() => {
    setPhotoUrl(props.initialPhotoUrl)
    setCity(props.initialCity)
    setPincode(props.initialPincode)
    setYearsExperience(
      String(props.role === 'worker' ? props.initialWorkerYearsExperience : props.initialYearsExperience || '')
    )
  }, [
    props.initialPhotoUrl,
    props.initialCity,
    props.initialPincode,
    props.initialYearsExperience,
    props.initialWorkerYearsExperience,
    props.role,
  ])

  useEffect(() => {
    if (!isControlled) return
    const prev = prevControlledOpen.current
    const cur = Boolean(props.panelOpen)
    if (prev === true && cur === false) resetDraft()
    prevControlledOpen.current = cur
  }, [isControlled, props.panelOpen])

  const setEditingVisible = (next: boolean) => {
    if (isControlled) {
      props.onPanelOpenChange!(next)
    } else {
      if (!next) resetDraft()
      setInternalOpen(next)
    }
  }

  const onToggleEdit = () => {
    if (!isControlled && editingVisible) resetDraft()
    setEditingVisible(!editingVisible)
  }

  const onSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      let nextPhotoUrl = photoUrl.trim() || null
      if (pendingPhotoFile) {
        setUploading(true)
        const formData = new FormData()
        formData.append('file', pendingPhotoFile)
        formData.append('folder', 'profile')
        const uploadRes = await fetch('/api/upload/photo', { method: 'POST', body: formData })
        const uploadPayload = (await uploadRes.json()) as { url?: string; error?: string }
        if (!uploadRes.ok || !uploadPayload.url) throw new Error(uploadPayload.error ?? 'Upload failed')
        nextPhotoUrl = uploadPayload.url
      }
      const payload: Record<string, unknown> = {
        profile_photo_url: nextPhotoUrl,
        city: city.trim() || null,
        pincode: pincode.trim() || null,
      }
      if (props.role === 'contractor') {
        payload.contractor = {
          years_experience: Number(yearsExperience || 0),
        }
      }
      if (props.role === 'worker') {
        payload.worker = {
          years_experience: Number(yearsExperience || 0),
        }
      }
      const res = await fetch('/api/account/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Unable to save profile')
      setPhotoUrl(nextPhotoUrl ?? '')
      setPendingPhotoFile(null)
      setMessage('Profile updated successfully.')
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save profile')
    } finally {
      setUploading(false)
      setSaving(false)
    }
  }

  const showToggle = !props.hideToggleButton

  if (props.hideToggleButton && !editingVisible) return null

  return (
    <section className={showToggle ? 'mb-6' : 'mx-4 mb-4 mt-3.5'}>
      {showToggle ? (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            onClick={onToggleEdit}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              borderWidth: 1,
              borderColor: '#FED7AA',
              backgroundColor: '#FFF7ED',
              color: '#C2410C',
            }}
          >
            {editingVisible ? 'Cancel edit' : 'Edit profile'}
          </button>
        </div>
      ) : null}
      {editingVisible ? (
        <div className="rounded-2xl border border-[#E8DDD4] bg-white p-4">
          <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
            EDIT PROFILE
          </p>
          <div className="space-y-3">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setPendingPhotoFile(file)
                  setMessage(null)
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={saving}
                className="w-full min-h-[42px] rounded-[10px] px-4 py-2 text-sm font-bold disabled:opacity-60"
                style={{
                  borderWidth: 1,
                  borderColor: '#FED7AA',
                  backgroundColor: '#FFF7ED',
                  color: '#C2410C',
                }}
              >
                {pendingPhotoFile ? 'Photo selected' : 'Change profile photo'}
              </button>
              {pendingPhotoFile ? (
                <p className="mt-1 text-[11px] text-slate-500">{`Selected: ${pendingPhotoFile.name}`}</p>
              ) : photoUrl ? (
                <p className="mt-1 text-[11px] text-slate-500">Current photo will be kept</p>
              ) : null}
            </div>
            {props.role === 'contractor' || props.role === 'worker' ? (
              <div>
                <label className="mb-1 block text-[11px] font-bold text-gray-500">Years experience</label>
                <input
                  value={yearsExperience}
                  onChange={(event) => setYearsExperience(event.target.value.replace(/[^\d]/g, ''))}
                  className="min-h-10 w-full rounded-[10px] border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-gray-500">City</label>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="min-h-10 w-full rounded-[10px] border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-gray-500">Pincode</label>
                <input
                  value={pincode}
                  onChange={(event) => setPincode(event.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  className="min-h-10 w-full rounded-[10px] border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {message ? <p className="text-xs text-slate-600">{message}</p> : null}
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving || uploading}
              className="mt-3 min-h-[46px] w-full rounded-[10px] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: '#D85A30' }}
            >
              {saving || uploading ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
