'use client'

import { useRouter } from 'next/navigation'

type ReinviteContractorButtonProps = {
  projectId: string
  projectName: string
  address: string
  city: string
  pincode: string
}

export default function ReinviteContractorButton({
  projectId,
  projectName,
  address,
  city,
  pincode,
}: ReinviteContractorButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    sessionStorage.setItem(
      'projectDraft',
      JSON.stringify({
        project_name: projectName,
        address,
        city,
        pincode,
      })
    )
    router.push(`/contractors?city=${encodeURIComponent(city)}&projectDraft=true&projectId=${projectId}`)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex rounded-lg bg-[#E8590C] px-4 py-2 text-sm font-semibold text-white"
    >
      Find New Contractor
    </button>
  )
}
