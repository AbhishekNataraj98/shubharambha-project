'use client'

import { useProfileEditPanel } from '@/components/profile/profile-edit-panel'

function initialsFromName(name?: string | null) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U'
}

export default function ProfessionalProfileHero({
  name,
  role,
  profilePhotoUrl,
  coverImageUrl,
  avgRating,
  projectsCompleted,
}: {
  name: string
  role: string
  profilePhotoUrl: string | null
  coverImageUrl: string | null
  avgRating: number
  projectsCompleted: number
}) {
  const { open, toggle } = useProfileEditPanel()

  return (
    <section className="relative h-[130px] overflow-hidden">
      {coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #3D2A20, #5C3820, #2C2C2A)' }} />
      )}
      <div className="absolute inset-0 bg-black/[0.38]" />
      {avgRating >= 4.5 ? (
        <div className="absolute right-3 top-2.5 rounded-full bg-[#D85A30] px-2.5 py-1 text-[9px] font-bold text-white">⭐ Top rated</div>
      ) : projectsCompleted >= 5 ? (
        <div className="absolute right-3 top-2.5 rounded-full bg-black/50 px-2.5 py-1 text-[9px] font-semibold text-white">{`${projectsCompleted} projects`}</div>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        className="absolute left-3 top-2.5 z-10 rounded-[10px] border border-white/30 bg-white/15 px-2.5 py-1 text-[9px] font-semibold text-white/90 backdrop-blur-[2px]"
      >
        {open ? 'Cancel ✕' : 'Edit ✎'}
      </button>
      <div className="absolute bottom-2.5 left-3 z-10 flex items-center gap-2.5">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-[2.5px] border-white/50 bg-[#D85A30] text-base font-extrabold text-white">
          {profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profilePhotoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsFromName(name)
          )}
        </div>
        <div>
          <p className="text-[17px] font-extrabold leading-tight text-white">{name}</p>
          <span className="mt-1 inline-block rounded-full bg-[#D85A30] px-2.5 py-0.5 text-[9px] font-bold capitalize text-white">{role}</span>
        </div>
      </div>
      <div className="absolute bottom-3.5 right-3 z-10 rounded-[10px] bg-black/50 px-2 py-1 text-[9px] font-bold text-[#F59E0B]">{`★ ${avgRating.toFixed(1)}`}</div>
    </section>
  )
}
