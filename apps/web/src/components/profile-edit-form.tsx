'use client'

import { useRef, useState } from 'react'

type Props = {
  role: string
  initialPhotoUrl: string
  initialCity: string
  initialPincode: string
  initialYearsExperience: number
  initialWorkerYearsExperience: number
}

export default function ProfileEditForm(props: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [editing, setEditing] = useState(false)
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

  const onToggleEdit = () => {
    if (editing) resetDraft()
    setEditing((prev) => !prev)
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

  return (
    <section className="mb-6">
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
          {editing ? 'Cancel edit' : 'Edit profile'}
        </button>
      </div>
      {editing ? (
        <div className="rounded-lg bg-white p-4 shadow-sm">
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
                className="w-full rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
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
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Years experience</label>
                  <input
                    value={yearsExperience}
                    onChange={(event) => setYearsExperience(event.target.value.replace(/[^\d]/g, ''))}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">City</label>
                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Pincode</label>
                <input
                  value={pincode}
                  onChange={(event) => setPincode(event.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {message ? <p className="text-xs text-slate-600">{message}</p> : null}
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving || uploading}
              className="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving || uploading ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

