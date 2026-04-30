'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const projectDraftSchema = z.object({
  project_name: z.string().trim().min(2, 'Building name is required'),
  address: z.string().trim().min(5, 'Address is required'),
  city: z.string().trim().min(2, 'City is required'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter valid 6-digit pincode'),
  project_type: z.enum(['Residential', 'Commercial', 'Renovation']).default('Residential'),
  estimated_budget: z
    .union([z.number().positive(), z.nan()])
    .optional()
    .transform((value) => (typeof value === 'number' && !Number.isNaN(value) ? value : undefined)),
  start_date: z.string().optional(),
})

type ProjectDraftInput = z.infer<typeof projectDraftSchema>

const projectTypes: ProjectDraftInput['project_type'][] = ['Residential', 'Commercial', 'Renovation']

export default function NewProjectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [sendingInvite, setSendingInvite] = useState(false)
  const invitedContractorId = searchParams.get('inviteTo')
  const invitedContractorName = searchParams.get('inviteToName')
  const isInviteMode = Boolean(invitedContractorId)

  const form = useForm<ProjectDraftInput>({
    resolver: zodResolver(projectDraftSchema),
    defaultValues: {
      project_name: '',
      address: '',
      city: '',
      pincode: '',
      project_type: 'Residential',
      estimated_budget: undefined,
      start_date: '',
    },
  })

  const watchedName = useWatch({ control: form.control, name: 'project_name' }) ?? ''
  const watchedAddress = useWatch({ control: form.control, name: 'address' }) ?? ''
  const watchedCity = useWatch({ control: form.control, name: 'city' }) ?? ''
  const watchedPincode = useWatch({ control: form.control, name: 'pincode' }) ?? ''
  const watchedProjectType = useWatch({ control: form.control, name: 'project_type' }) ?? 'Residential'

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile || profile.role !== 'customer') {
        router.replace('/dashboard')
      }
    }

    void run()
  }, [router, supabase])

  const onFindContractor = (values: ProjectDraftInput) => {
    sessionStorage.setItem('projectDraft', JSON.stringify(values))
    const city = encodeURIComponent(values.city)
    router.push(`/contractors?city=${city}&projectDraft=true`)
  }

  const onSubmitInvite = async (values: ProjectDraftInput) => {
    if (!invitedContractorId) return
    setSendingInvite(true)
    try {
      const response = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractor_id: invitedContractorId,
          ...values,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        form.setError('root', { message: payload.error ?? 'Failed to send invitation' })
        return
      }
      sessionStorage.removeItem('projectDraft')
      router.push('/dashboard')
      router.refresh()
    } catch {
      form.setError('root', { message: 'Failed to send invitation' })
    } finally {
      setSendingInvite(false)
    }
  }

  const canContinue =
    watchedName.trim().length > 1 &&
    watchedAddress.trim().length > 4 &&
    watchedCity.trim().length > 1 &&
    /^\d{6}$/.test(watchedPincode)

  return (
    <div className="min-h-screen bg-white px-4 py-5">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">New Project</h1>
        </header>
        {isInviteMode ? (
          <p className="mb-3 text-sm text-gray-600">
            Sending invitation to <span className="font-semibold text-gray-900">{invitedContractorName || 'selected contractor'}</span>
          </p>
        ) : null}

        <div className="mb-6 flex items-center gap-2 text-sm">
          <div className="rounded-full bg-orange-100 px-3 py-1 font-semibold text-[#D85A30]">
            1. Project Details
          </div>
          <span className="text-gray-400">→</span>
          <div className={`rounded-full px-3 py-1 ${isInviteMode ? 'bg-orange-100 text-[#D85A30] font-semibold' : 'bg-gray-100 text-gray-500'}`}>
            {isInviteMode ? '2. Send Invite' : '2. Find Contractor'}
          </div>
        </div>

        <form onSubmit={form.handleSubmit(isInviteMode ? onSubmitInvite : onFindContractor)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Building name*</label>
            <input
              type="text"
              placeholder="Sharma Residence"
              {...form.register('project_name')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Address*</label>
            <textarea
              rows={2}
              {...form.register('address')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">City*</label>
            <input
              type="text"
              {...form.register('city')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Pincode*</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              {...form.register('pincode')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-800">Project type</label>
            <div className="flex flex-wrap gap-2">
              {projectTypes.map((type) => {
                const selected = watchedProjectType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => form.setValue('project_type', type, { shouldDirty: true })}
                    className={`rounded-full px-3 py-1.5 text-sm ${
                      selected ? 'bg-orange-100 text-[#D85A30]' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {type}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Estimated budget</label>
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-gray-500">₹</span>
              <input
                type="number"
                min={0}
                {...form.register('estimated_budget', { valueAsNumber: true })}
                className="w-full rounded-lg border border-gray-300 py-2.5 pr-3 pl-7 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Expected start</label>
            <input
              type="date"
              {...form.register('start_date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>

          <Button
            type="submit"
            disabled={!canContinue || sendingInvite}
            className="mt-4 h-12 w-full rounded-lg bg-[#D85A30] text-base font-semibold text-white hover:bg-[#cf4e09]"
          >
            {isInviteMode ? (sendingInvite ? 'Sending Invite...' : 'Send Invite') : 'Find Contractor'}
          </Button>
          {form.formState.errors.root?.message ? <p className="text-sm text-red-600">{form.formState.errors.root.message}</p> : null}
        </form>
      </div>
    </div>
  )
}
