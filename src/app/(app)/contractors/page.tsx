'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import BottomNav from '@/components/shared/bottom-nav'

type ContractorItem = {
  id: string
  name: string
  city: string
  avg_rating: number
  total_reviews: number
  projects_completed: number
  specialisations: string[]
  years_experience: number
}

const filterPills = [
  'Residential',
  'Commercial',
  'Foundation',
  'Plastering',
  'Waterproofing',
  'Interior',
]

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

export default function ContractorsPage() {
  const searchParams = useSearchParams()
  const [city, setCity] = useState(searchParams.get('city') ?? '')
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [contractors, setContractors] = useState<ContractorItem[]>([])

  const projectDraftMode = searchParams.get('projectDraft') === 'true'
  const projectId = searchParams.get('projectId')

  const selectedSpecialisation = activeFilters[0]

  useEffect(() => {
    if (!city.trim()) {
      return
    }

    const fetchContractors = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ city: city.trim() })
        if (selectedSpecialisation) {
          params.set('specialisation', selectedSpecialisation)
        }

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
  }, [city, selectedSpecialisation])

  const filteredContractors = useMemo(() => {
    if (activeFilters.length <= 1) return contractors
    return contractors.filter((contractor) =>
      activeFilters.every((filter) => contractor.specialisations.includes(filter))
    )
  }, [activeFilters, contractors])

  return (
    <div className="min-h-screen bg-white px-4 py-5 pb-24">
      <div className="mx-auto w-full max-w-md">
        {projectDraftMode && (
          <div className="mb-4 rounded-lg bg-orange-100 px-3 py-2 text-sm font-medium text-[#E8590C]">
            Select a contractor for your project
          </div>
        )}

        <header className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Find Contractors</h1>
        </header>

        <div>
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {filterPills.map((pill) => {
              const active = activeFilters.includes(pill)
              return (
                <button
                  key={pill}
                  type="button"
                  onClick={() =>
                    setActiveFilters((prev) =>
                      prev.includes(pill) ? prev.filter((item) => item !== pill) : [...prev, pill]
                    )
                  }
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    active ? 'bg-orange-100 text-[#E8590C]' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {pill}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <>
              <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
              <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
            </>
          ) : filteredContractors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-600">
              No contractors found in {city || 'this city'}. Try a nearby city.
            </div>
          ) : (
            filteredContractors.map((contractor) => (
              <div key={contractor.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-[#E8590C]">
                      {initials(contractor.name)}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">{contractor.name}</h2>
                      <p className="text-sm text-gray-500">{contractor.city}</p>
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-sm text-gray-700">
                  {starText(contractor.avg_rating)} {contractor.avg_rating.toFixed(1)} ({contractor.total_reviews})
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {contractor.specialisations.slice(0, 2).map((spec) => (
                    <span key={spec} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                      {spec}
                    </span>
                  ))}
                  {contractor.specialisations.length > 2 && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                      +{contractor.specialisations.length - 2} more
                    </span>
                  )}
                </div>

                <p className="mt-3 text-xs text-gray-500">{contractor.projects_completed} projects completed</p>

                <Button asChild className="mt-3 h-9 w-full bg-[#E8590C] text-white hover:bg-[#cf4e09]">
                  <Link
                    href={`/contractors/${contractor.id}?projectDraft=${projectDraftMode ? 'true' : 'false'}${
                      projectId ? `&projectId=${projectId}` : ''
                    }`}
                  >
                    View Profile
                  </Link>
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
