'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type InviteContractorBarProps = {
  contractorId: string
  contractorName: string
  contractorCity?: string | null
  projectId?: string
  inviteLimit?: number
  inviteLimitReached?: boolean
  inviteLockMessage?: string | null
  activeProjects?: Array<{ id: string; name: string; status: string }>
  hasPendingInvitation?: boolean
  pendingInvitations?: Array<{ id: string; subject: string; project_id: string | null }>
}

type ProjectDraft = {
  project_name: string
  address: string
  city: string
  pincode: string
  project_type?: string
  estimated_budget?: number
  start_date?: string
}

export default function InviteContractorBar({
  contractorId,
  contractorName,
  contractorCity,
  projectId,
  inviteLimit = 3,
  inviteLimitReached = false,
  inviteLockMessage,
  activeProjects = [],
  hasPendingInvitation = false,
  pendingInvitations = [],
}: InviteContractorBarProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLockedModal, setShowLockedModal] = useState(false)

  const sendInvite = async () => {
    if (isLoading) return
    if (inviteLimitReached) {
      setShowLockedModal(true)
      return
    }
    if (!projectId) {
      router.push(
        `/projects/new?inviteTo=${encodeURIComponent(contractorId)}&inviteToName=${encodeURIComponent(contractorName)}&inviteToCity=${encodeURIComponent(contractorCity ?? '')}`
      )
      return
    }
    const yes = window.confirm(`Do you want to invite ${contractorName} for work?`)
    if (!yes) return
    let draft: ProjectDraft
    const raw = sessionStorage.getItem('projectDraft')
    if (!raw) {
      draft = {
        project_name: `Work with ${contractorName}`,
        address: 'Address to be updated',
        city: contractorCity || 'City',
        pincode: '000000',
      }
    } else {
      try {
        draft = JSON.parse(raw) as ProjectDraft
      } catch {
        setError('Invalid draft. Please start project creation again.')
        return
      }
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          contractor_id: contractorId,
          ...draft,
        }),
      })
      const payload = (await response.json()) as { error?: string; projectId?: string }
      if (!response.ok) {
        setError(payload.error ?? 'Failed to send invitation')
        return
      }

      sessionStorage.removeItem('projectDraft')
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Failed to send invitation')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed right-0 bottom-0 left-0 z-30 px-4 py-3" style={{ backgroundColor: 'white', borderTop: '1px solid #E0D5CC' }}>
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
            Send Invitation
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {hasPendingInvitation
              ? `Pending invitation with this ${inviteLimit === 1 ? 'worker' : 'contractor'}`
              : `Active projects with this ${inviteLimit === 1 ? 'worker' : 'contractor'}: ${activeProjects.length}/${inviteLimit}`}
          </p>
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={sendInvite}
          disabled={isLoading}
          className="flex-shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60 hover:opacity-90"
          style={{ backgroundColor: inviteLimitReached ? '#9CA3AF' : '#E8590C' }}
        >
          {isLoading ? 'Sending...' : inviteLimitReached ? 'Locked' : 'Send'}
        </button>
      </div>
      {showLockedModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-orange-200 bg-orange-50 px-5 py-4">
              <p className="text-xs font-bold tracking-wide text-orange-800">INVITATION LIMIT REACHED</p>
              <h3 className="mt-2 text-base font-extrabold text-gray-900">Invite locked</h3>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                {inviteLockMessage ?? 'Active project limit reached. Complete an existing project to send a new invite.'}
              </p>
            </div>

            <div className="px-5 pt-4 pb-2">
              <p className="mb-3 text-xs font-bold tracking-wide text-gray-500">
                {hasPendingInvitation
                  ? `PENDING INVITATIONS (${pendingInvitations.length})`
                  : `ACTIVE PROJECTS (${activeProjects.length}/${inviteLimit})`}
              </p>
              {hasPendingInvitation ? (
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {pendingInvitations.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left"
                    >
                      <span className="text-sm font-semibold text-gray-800">
                        {invite.subject.replace(/^Project invitation \[[^\]]+\]:\s*/i, '')}
                      </span>
                      <span className="text-xs font-semibold text-amber-700">Awaiting response</span>
                    </div>
                  ))}
                </div>
              ) : activeProjects.length > 0 ? (
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {activeProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setShowLockedModal(false)
                        router.push(`/projects/${project.id}`)
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-left transition hover:border-orange-200 hover:bg-orange-50"
                    >
                      <span className="text-sm font-semibold text-gray-800">{project.name}</span>
                      <span className="text-xs font-semibold text-orange-700">Open project</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {hasPendingInvitation ? 'Previous invitation is still awaiting response.' : 'No active projects found.'}
                </p>
              )}
            </div>

            <div className="px-5 pt-3 pb-5">
              <button
                type="button"
                onClick={() => setShowLockedModal(false)}
                className="w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
