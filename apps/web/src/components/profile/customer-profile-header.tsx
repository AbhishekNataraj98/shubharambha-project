'use client'

import { formatPhoneIndian } from '@/lib/utils'
import { useProfileEditPanel } from '@/components/profile/profile-edit-panel'

function initialsFromName(name?: string | null) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U'
}

export default function CustomerProfileHeader({
  name,
  role,
  phone,
  city,
  pincode,
  profilePhotoUrl,
  invitationsPending,
  activeCount,
  completedCount,
}: {
  name: string
  role: string
  phone: string | null
  city: string | null
  pincode: string | null
  profilePhotoUrl: string | null
  invitationsPending: number
  activeCount: number
  completedCount: number
}) {
  const { open, toggle } = useProfileEditPanel()

  return (
    <>
      {/* Dark brown hero band (no charcoal / orange wedge), overlapping avatar */}
      <section className="relative h-[120px] overflow-visible">
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            background: 'linear-gradient(115deg, #3d3632 0%, #4a423c 42%, #524840 100%)',
          }}
        />
        <div className="absolute right-3.5 top-3 z-10">
          <button
            type="button"
            onClick={toggle}
            className="rounded-[10px] px-2.5 py-1 text-[9px] font-semibold"
            style={{
              border: '0.5px solid rgba(255,255,255,0.3)',
              color: 'rgba(255,255,255,0.9)',
              backgroundColor: 'rgba(255,255,255,0.18)',
            }}
          >
            {open ? 'Cancel ✕' : 'Edit ✎'}
          </button>
        </div>
        <div className="absolute bottom-[-36px] left-1/2 z-10 flex h-[72px] w-[72px] -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border-[3px] bg-[#D85A30] text-2xl font-bold text-white" style={{ borderColor: '#F2EDE8' }}>
          {profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profilePhotoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsFromName(name)
          )}
        </div>
      </section>

      <section className="px-4 pb-4 pt-11 text-center">
        <h2 className="mb-1.5 text-xl font-extrabold" style={{ color: '#2C2C2A' }}>
          {name}
        </h2>
        <span className="inline-block rounded-full bg-[#D85A30] px-4 py-1 text-[10px] font-bold capitalize text-white">{role}</span>
        <p className="mt-3 text-[15px] font-bold leading-snug" style={{ color: '#2C2C2A' }}>
          {`📞 ${formatPhoneIndian(phone)}`}
        </p>
        <p className="mt-2 text-[15px] font-bold leading-snug" style={{ color: '#2C2C2A' }}>
          {`📍 ${city ?? '—'} · ${pincode ?? '—'}`}
        </p>
      </section>

      <section className="flex gap-2.5 px-4 pb-1">
        <div className="flex flex-1 flex-col items-center rounded-[14px] border border-[#E8DDD4] bg-white px-3 py-3">
          <p className="text-lg font-extrabold text-[#D85A30]">{invitationsPending}</p>
          <p className="mt-1 text-[8px] font-semibold" style={{ color: '#78716C' }}>
            Invitations
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center rounded-[14px] border border-[#E8DDD4] bg-white px-3 py-3">
          <p className="text-lg font-extrabold text-[#D85A30]">{activeCount}</p>
          <p className="mt-1 text-[8px] font-semibold" style={{ color: '#78716C' }}>
            Active
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center rounded-[14px] border border-[#E8DDD4] bg-white px-3 py-3">
          <p className="text-lg font-extrabold text-[#D85A30]">{completedCount}</p>
          <p className="mt-1 text-[8px] font-semibold" style={{ color: '#78716C' }}>
            Completed
          </p>
        </div>
      </section>
    </>
  )
}
