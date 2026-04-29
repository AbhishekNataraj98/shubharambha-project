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
  profile_kind: 'contractor' | 'worker'
  trade: string | null
  avg_rating: number
  total_reviews: number
  projects_completed: number
  specialisations: string[]
  years_experience: number
}

const profilePills = ['Contractor', 'Mason', 'Plumber', 'Carpenter', 'Electrician', 'Painter'] as const

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

  const filteredContractors = useMemo(() => contractors, [contractors])

  return (
    <div className="min-h-screen px-4 py-5 pb-28" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="mx-auto w-full max-w-md">
        {projectDraftMode && (
          <div className="fixed inset-x-0 bottom-24 z-10 px-4 py-3" style={{ backgroundColor: '#E8590C' }}>
            <div className="mx-auto max-w-md text-center font-semibold text-white">
              Select a contractor to proceed
            </div>
          </div>
        )}

        <header className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
            Find Contractors
          </h1>
          <p className="mt-1 text-sm font-medium" style={{ color: '#7A6F66' }}>
            Discover trusted professionals for your project
          </p>
        </header>

        <div className="mb-6 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2"
              style={{ color: '#E8590C' }}
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
              placeholder="Search by city"
              className="w-full rounded-lg border-2 pl-10 pr-4 py-3 text-sm font-medium focus:outline-none transition-all"
              style={{
                borderColor: '#E0D5CC',
                color: '#1A1A1A',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#E8590C'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#E0D5CC'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Profile Type Pills */}
          <div className="flex flex-wrap gap-2">
            {profilePills.map((pill) => {
              const active = profileType === pill
              return (
                <button
                  key={pill}
                  type="button"
                  onClick={() => setProfileType(pill)}
                  className="rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-all"
                  style={{
                    borderColor: active ? '#E8590C' : '#E0D5CC',
                    backgroundColor: active ? '#FFF8F5' : 'white',
                    color: active ? '#E8590C' : '#7A6F66',
                  }}
                >
                  {pill}
                </button>
              )
            })}
          </div>
        </div>

        {/* Contractors List */}
        <div className="space-y-3">
          {isLoading ? (
            <>
              <div className="h-32 animate-pulse rounded-lg bg-gray-200" />
              <div className="h-32 animate-pulse rounded-lg bg-gray-200" />
            </>
          ) : filteredContractors.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center" style={{ borderColor: '#E0D5CC', backgroundColor: '#FFFBF7' }}>
              <p className="text-sm font-medium" style={{ color: '#7A6F66' }}>
                No {profileType} found in {city || 'this city'}. Try nearby city.
              </p>
            </div>
          ) : (
            filteredContractors.map((contractor) => {
              const isContractor = contractor.profile_kind === 'contractor'
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
                  <div className="flex items-start gap-4 rounded-lg bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                    {/* Avatar */}
                    <div
                      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: '#E8590C' }}
                    >
                      {initials(contractor.name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <h2 className="font-bold" style={{ color: '#1A1A1A' }}>
                        {contractor.name}
                      </h2>
                      <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                        {contractor.city}
                      </p>
                      <p className="mt-1 text-xs font-semibold" style={{ color: '#374151' }}>
                        {isContractor ? 'Contractor' : contractor.trade ?? 'Worker'}
                      </p>

                      {/* Rating */}
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: '#B8860B' }}>
                        {starText(contractor.avg_rating)}{' '}
                        <span style={{ color: '#7A6F66' }}>
                          {contractor.avg_rating.toFixed(1)} ({contractor.total_reviews})
                        </span>
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {contractor.specialisations.slice(0, 2).map((spec) => (
                          <span key={spec} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: '#E0D5CC', color: '#1A1A1A' }}>
                            {spec}
                          </span>
                        ))}
                      </div>

                      {/* Projects badge */}
                      <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                        {contractor.projects_completed} project{contractor.projects_completed !== 1 ? 's' : ''} completed
                      </p>
                    </div>

                    <svg
                      className="h-5 w-5 flex-shrink-0"
                      style={{ color: '#E8590C' }}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
