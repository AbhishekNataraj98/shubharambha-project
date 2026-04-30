'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import BottomNav from '@/components/shared/bottom-nav'

type ContractorItem = {
  id: string
  name: string
  city: string
  profile_photo_url: string | null
  profile_images: string[]
  profile_kind: 'contractor' | 'worker'
  trade: string | null
  avg_rating: number
  total_reviews: number
  projects_completed: number
  specialisations: string[]
  years_experience: number
}

const profilePills = ['Contractor', 'Mason', 'Plumber', 'Carpenter', 'Electrician', 'Painter'] as const
const sortPills = ['Top rated', 'Most experienced'] as const

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function starText(avg: number) {
  const rounded = Math.round(avg)
  const filled = '★'.repeat(Math.max(0, Math.min(5, rounded)))
  const empty = '☆'.repeat(5 - Math.max(0, Math.min(5, rounded)))
  return `${filled}${empty}`
}

const PROFILE_LINK_DEBOUNCE_MS = 600

export default function ContractorsPage() {
  const searchParams = useSearchParams()
  const lastProfileLinkAtRef = useRef(0)
  const [city, setCity] = useState(searchParams.get('city') ?? '')
  const [profileType, setProfileType] = useState<(typeof profilePills)[number]>('Contractor')
  const [isLoading, setIsLoading] = useState(false)
  const [contractors, setContractors] = useState<ContractorItem[]>([])
  const [sortBy, setSortBy] = useState<(typeof sortPills)[number]>('Top rated')

  const projectDraftMode = searchParams.get('projectDraft') === 'true'
  const projectId = searchParams.get('projectId')

  useEffect(() => {
    if (!city.trim()) {
      return
    }

    const fetchContractors = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ city: city.trim() })
        params.set('profileType', profileType.toLowerCase())

        const response = await fetch(`/api/contractors/search?${params.toString()}`)
        const data = (await response.json()) as ContractorItem[]
        if (response.ok) {
          setContractors(data)
        } else {
          setContractors([])
        }
      } catch {
        setContractors([])
      } finally {
        setIsLoading(false)
      }
    }

    void fetchContractors()
  }, [city, profileType])

  const filteredContractors = useMemo(() => {
    const list = [...contractors]
    if (sortBy === 'Top rated') {
      list.sort((a, b) => b.avg_rating - a.avg_rating || b.total_reviews - a.total_reviews)
    } else {
      list.sort((a, b) => b.years_experience - a.years_experience || b.avg_rating - a.avg_rating)
    }
    return list
  }, [contractors, sortBy])

  return (
    <div className="min-h-screen bg-[#F2EDE8] pb-28">
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white">
        <div className="mx-auto w-full max-w-md px-4 py-3">
          <h1 className="text-xl font-bold text-gray-900">Find professionals</h1>
          <p className="mt-0.5 text-sm text-gray-500">Discover trusted professionals near you</p>

          <div className="relative mt-3">
            <svg
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={city}
              onChange={(event) => {
                const nextCity = event.target.value
                setCity(nextCity)
                if (!nextCity.trim()) {
                  setContractors([])
                }
              }}
              placeholder="Search by city..."
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm text-gray-900 focus:outline-none"
              style={{
                borderColor: '#E5E7EB',
                backgroundColor: '#F9FAFB',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#FB923C'
                e.currentTarget.style.backgroundColor = '#FFFFFF'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(251,146,60,0.10)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#E5E7EB'
                e.currentTarget.style.backgroundColor = '#F9FAFB'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {profilePills.map((pill) => {
              const active = profileType === pill
              return (
                <button
                  key={pill}
                  type="button"
                  onClick={() => setProfileType(pill)}
                  className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{
                    border: `1px solid ${active ? '#F97316' : '#E5E7EB'}`,
                    backgroundColor: active ? '#F97316' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#4B5563',
                  }}
                >
                  {pill}
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">{`${filteredContractors.length} professionals found`}</p>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as (typeof sortPills)[number])}
              className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 outline-none"
            >
              {sortPills.map((pill) => (
                <option key={pill} value={pill}>
                  {pill}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md">
        {projectDraftMode ? (
          <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-orange-500 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 10.5L12 3l9 7.5" />
                <path d="M5.5 9.5V20h13V9.5" />
                <path d="M10 20v-5h4v5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Select a contractor for your project</p>
              <p className="mt-0.5 text-xs text-orange-100">Tap a profile below to send an invitation</p>
            </div>
          </div>
        ) : null}

        {filteredContractors.length > 0 && !isLoading ? (
          <>
            <div className="mb-3 mt-4 flex items-center justify-between px-4">
              <p className="text-sm font-bold text-gray-900">Top rated</p>
              <button type="button" className="text-xs text-orange-500">See all</button>
            </div>
            <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: 'none' }}>
              {filteredContractors.slice(0, 3).map((contractor) => (
                <Link
                  key={`featured-${contractor.id}`}
                  prefetch={false}
                  href={`/contractors/${contractor.id}?projectDraft=${projectDraftMode ? 'true' : 'false'}${
                    projectId ? `&projectId=${projectId}` : ''
                  }`}
                  onClick={(e) => {
                    const now = Date.now()
                    if (now - lastProfileLinkAtRef.current < PROFILE_LINK_DEBOUNCE_MS) {
                      e.preventDefault()
                      return
                    }
                    lastProfileLinkAtRef.current = now
                  }}
                  className="min-w-[150px] w-[150px]"
                >
                  <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <div className="relative h-[90px] bg-gray-100">
                      {contractor.profile_images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={contractor.profile_images[0]} alt={contractor.name} className="h-full w-full object-cover" />
                      ) : contractor.profile_photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={contractor.profile_photo_url} alt={contractor.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-400">
                          <svg viewBox="0 0 24 24" className="h-8 w-8 opacity-60" fill="currentColor">
                            <polygon points="12,3 2.5,10.5 4.2,10.5 4.2,21 9.8,21 9.8,14.5 14.2,14.5 14.2,21 19.8,21 19.8,10.5 21.5,10.5" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                        {`★ ${contractor.avg_rating.toFixed(1)}`}
                      </div>
                      <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-orange-500 text-[10px] font-bold text-white">
                        {contractor.profile_photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={contractor.profile_photo_url} alt={contractor.name} className="h-full w-full object-cover" />
                        ) : (
                          initials(contractor.name)
                        )}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold text-gray-900">{contractor.name}</p>
                      <p className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-gray-500">{contractor.city}</p>
                      <span className="mt-1.5 inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700">
                        {contractor.specialisations[0] || contractor.trade || 'Professional'}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : null}

        <div className="mb-3 mt-5 px-4">
          <p className="text-sm font-bold text-gray-900">All professionals</p>
        </div>

        {isLoading ? (
          <div className="space-y-4 px-4">
            <div className="h-[200px] animate-pulse rounded-2xl bg-gray-100" />
            <div className="h-[200px] animate-pulse rounded-2xl bg-gray-100" />
            <div className="h-[200px] animate-pulse rounded-2xl bg-gray-100" />
          </div>
        ) : filteredContractors.length === 0 ? (
          <div className="mx-4 rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center text-gray-300">
              <svg viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor">
                <polygon points="12,3 2.5,10.5 4.2,10.5 4.2,21 9.8,21 9.8,14.5 14.2,14.5 14.2,21 19.8,21 19.8,10.5 21.5,10.5" />
              </svg>
            </div>
            <p className="mt-3 font-semibold text-gray-600">No professionals found</p>
            <p className="mt-1 text-sm text-gray-400">Try searching a nearby city like Secunderabad or Medchal</p>
          </div>
        ) : (
          <div className="space-y-4 px-4">
            {filteredContractors.map((contractor) => {
              const hasHeroPhoto = Boolean(contractor.profile_images[0])
              const hasAnyPhoto = Boolean(contractor.profile_images[0] || contractor.profile_photo_url)
              const topSpecs = contractor.specialisations.slice(0, 3)
              const hasMoreSpecs = contractor.specialisations.length > 3
              const moreSpecs = contractor.specialisations.length - 3
              return (
                <Link
                  key={contractor.id}
                  prefetch={false}
                  href={`/contractors/${contractor.id}?projectDraft=${projectDraftMode ? 'true' : 'false'}${
                    projectId ? `&projectId=${projectId}` : ''
                  }`}
                  onClick={(e) => {
                    const now = Date.now()
                    if (now - lastProfileLinkAtRef.current < PROFILE_LINK_DEBOUNCE_MS) {
                      e.preventDefault()
                      return
                    }
                    lastProfileLinkAtRef.current = now
                  }}
                >
                  <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-transform active:scale-[0.99]">
                    <div className={`relative ${hasAnyPhoto ? 'h-[140px]' : 'h-[80px]'} ${hasAnyPhoto ? '' : 'bg-gray-50'}`}>
                      {hasHeroPhoto ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={contractor.profile_images[0]} alt={contractor.name} className="absolute inset-0 h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                        </>
                      ) : hasAnyPhoto ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={contractor.profile_photo_url ?? ''} alt={contractor.name} className="absolute inset-0 h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-300">
                          <svg viewBox="0 0 24 24" className="h-9 w-9 opacity-20" fill="currentColor">
                            <polygon points="12,3 2.5,10.5 4.2,10.5 4.2,21 9.8,21 9.8,14.5 14.2,14.5 14.2,21 19.8,21 19.8,10.5 21.5,10.5" />
                          </svg>
                        </div>
                      )}

                      <div className="absolute left-0 right-0 bottom-0 flex items-end gap-3 p-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-white/40 bg-orange-500 text-sm font-bold text-white">
                          {contractor.profile_photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={contractor.profile_photo_url} alt={contractor.name} className="h-full w-full object-cover" />
                          ) : (
                            initials(contractor.name)
                          )}
                        </div>
                        {hasAnyPhoto ? (
                          <div className="flex-1">
                            <p className="text-[15px] font-bold leading-tight text-white">{contractor.name}</p>
                            <p className="mt-0.5 text-[11px] text-white/80">{contractor.city}</p>
                          </div>
                        ) : null}
                      </div>

                      {contractor.avg_rating >= 4.5 ? (
                        <div className="absolute right-3 top-3 rounded-full bg-orange-500 px-2 py-1 text-[10px] font-bold text-white">
                          ⭐ Top rated
                        </div>
                      ) : contractor.projects_completed >= 10 ? (
                        <div className="absolute right-3 top-3 rounded-full bg-gray-900/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                          {`${contractor.projects_completed} projects`}
                        </div>
                      ) : null}
                    </div>

                    <div className="p-4">
                      {!hasAnyPhoto ? (
                        <div className="mb-2">
                          <p className="text-[15px] font-bold leading-tight text-gray-900">{contractor.name}</p>
                          <p className="mt-0.5 text-[11px] text-gray-500">{contractor.city}</p>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-amber-400">{starText(contractor.avg_rating)}</p>
                          <p className="text-sm font-semibold text-gray-900">{contractor.avg_rating.toFixed(1)}</p>
                          <p className="text-xs text-gray-400">{`(${contractor.total_reviews} reviews)`}</p>
                        </div>
                        <p className="text-xs text-gray-500">{`${contractor.years_experience} yrs exp`}</p>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {topSpecs.map((spec) => (
                          <span key={spec} className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700">
                            {spec}
                          </span>
                        ))}
                        {hasMoreSpecs ? (
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-500">
                            {`+${moreSpecs} more`}
                          </span>
                        ) : null}
                        {contractor.profile_kind === 'worker' && contractor.trade ? (
                          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700">
                            {contractor.trade}
                          </span>
                        ) : null}
                      </div>

                      {contractor.profile_images.length > 0 ? (
                        <div className="mt-3 flex gap-2">
                          {contractor.profile_images.slice(0, 3).map((img, idx) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={`${contractor.id}-gallery-${idx}`}
                              src={img}
                              alt={`${contractor.name} profile ${idx + 1}`}
                              className="h-[52px] w-[72px] rounded-xl border border-gray-100 object-cover"
                            />
                          ))}
                          {contractor.profile_images.length > 3 ? (
                            <div className="flex h-[52px] w-[72px] items-center justify-center rounded-xl bg-gray-100 text-xs font-medium text-gray-500">
                              {`+${contractor.profile_images.length - 3}`}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                        <div className="flex gap-4">
                          <div className="text-center">
                            <p className="text-sm font-bold text-orange-500">{contractor.projects_completed}</p>
                            <p className="mt-0.5 text-[10px] text-gray-400">Projects</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-orange-500">{contractor.total_reviews}</p>
                            <p className="mt-0.5 text-[10px] text-gray-400">Reviews</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-orange-500">{`${contractor.years_experience}y`}</p>
                            <p className="mt-0.5 text-[10px] text-gray-400">Exp</p>
                          </div>
                        </div>
                        <span
                          className="rounded-xl px-4 py-2 text-xs font-semibold"
                          style={{
                            backgroundColor: projectDraftMode ? '#F97316' : '#FFF7ED',
                            color: projectDraftMode ? '#FFFFFF' : '#EA580C',
                            border: projectDraftMode ? 'none' : '1px solid #FED7AA',
                          }}
                        >
                          {projectDraftMode ? 'Invite' : 'View profile'}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
