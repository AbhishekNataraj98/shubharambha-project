'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { registerSchema, type RegisterInput } from '@/lib/validations/auth'
import type { Enums } from '@/types/supabase'

type RoleCard = {
  value: Enums<'user_role'>
  title: string
  description: string
  icon: ReactNode
}

const roleCards: RoleCard[] = [
  {
    value: 'customer',
    title: 'Customer',
    description: 'Building / renovating my home',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M3 11.5L12 4l9 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6.5 10.5V20h11V10.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    value: 'contractor',
    title: 'Contractor',
    description: 'I manage construction projects',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.5 6V4.8a3.5 3.5 0 0 1 7 0V6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    value: 'worker',
    title: 'Worker',
    description: 'Skilled tradesperson',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 20c.8-3.1 3.2-5 6.5-5s5.7 1.9 6.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    value: 'supplier',
    title: 'Supplier',
    description: 'I sell building materials',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M4 8.5L12 4l8 4.5-8 4.5-8-4.5z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 8.5V16l8 4 8-4V8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
]

const contractorSpecialisations = [
  'Residential',
  'Commercial',
  'Foundation',
  'Plastering',
  'Waterproofing',
  'Interior',
] as const

const workerTrades = [
  'Mason',
  'Carpenter',
  'Plumber',
  'Electrician',
  'Tile Fixer',
  'Painter',
  'Bar Bender',
  'Waterproofing Specialist',
] as const

const supplierCategories = [
  'Cement',
  'Steel',
  'Bricks',
  'Sand',
  'Tiles',
  'Paint',
  'Electrical',
  'Plumbing',
  'Timber',
] as const

function toggleValue(current: string[] | undefined, value: string) {
  return current?.includes(value)
    ? current.filter((item) => item !== value)
    : [...(current ?? []), value]
}

export default function RegisterForm() {
  const router = useRouter()
  const [apiError, setApiError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: undefined,
      name: '',
      city: '',
      pincode: '',
      bio: '',
      years_experience: undefined,
      service_cities: '',
      specialisations: [],
      trade: undefined,
      shop_name: '',
      shop_address: '',
      category_tags: [],
      whatsapp_number: '',
    },
  })

  const selectedRole = useWatch({ control: form.control, name: 'role' })
  const watchedName = useWatch({ control: form.control, name: 'name' }) ?? ''
  const watchedCity = useWatch({ control: form.control, name: 'city' }) ?? ''
  const watchedPincode = useWatch({ control: form.control, name: 'pincode' }) ?? ''
  const selectedSpecialisations = useWatch({ control: form.control, name: 'specialisations' }) ?? []
  const selectedCategories = useWatch({ control: form.control, name: 'category_tags' }) ?? []

  const isContinueDisabled = useMemo(() => {
    return !(selectedRole && watchedName.trim() && watchedCity.trim() && /^\d{6}$/.test(watchedPincode))
  }, [selectedRole, watchedName, watchedCity, watchedPincode])

  const onSubmit = async (values: RegisterInput) => {
    setIsSubmitting(true)
    setApiError(null)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const payload = (await response.json()) as { error?: string; redirectTo?: string }
      if (!response.ok || !payload.redirectTo) {
        setApiError(payload.error ?? 'Unable to create profile')
        return
      }

      router.replace(payload.redirectTo)
      router.refresh()
    } catch {
      setApiError('Unable to create profile')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-xl font-bold text-white">
            S
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create your profile</h1>
            <p className="text-sm text-gray-600">Tell us about yourself to get started</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <section className="space-y-3">
            <label className="block text-sm font-medium text-gray-900">I am a...</label>
            <div className="grid grid-cols-2 gap-3">
              {roleCards.map((role) => {
                const isSelected = selectedRole === role.value
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => {
                      form.setValue('role', role.value, { shouldValidate: true, shouldDirty: true })
                      setApiError(null)
                    }}
                    className="text-left"
                  >
                    <Card
                      className={`h-full transition-colors ${
                        isSelected
                          ? 'border-[#E8590C] bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-orange-200'
                      }`}
                    >
                      <CardHeader className="pb-2">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-[#E8590C]">
                            {role.icon}
                          </div>
                          <span
                            className={`h-5 w-5 rounded-full border-2 ${
                              isSelected
                                ? 'border-[#E8590C] bg-[#E8590C] ring-2 ring-orange-200'
                                : 'border-gray-300 bg-white'
                            }`}
                          />
                        </div>
                        <CardTitle>{role.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <CardDescription>{role.description}</CardDescription>
                      </CardContent>
                    </Card>
                  </button>
                )
              })}
            </div>
            {form.formState.errors.role?.message ? (
              <p className="text-xs text-red-600">{form.formState.errors.role.message}</p>
            ) : null}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Basic details</h2>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">Full name*</label>
              <input
                type="text"
                {...form.register('name')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
              />
              {form.formState.errors.name?.message ? (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">City*</label>
              <input
                type="text"
                {...form.register('city')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
              />
              {form.formState.errors.city?.message ? (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.city.message}</p>
              ) : null}
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
              {form.formState.errors.pincode?.message ? (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.pincode.message}</p>
              ) : null}
            </div>
          </section>

          {selectedRole === 'contractor' ? (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Contractor details</h2>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">Years of experience</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  {...form.register('years_experience', { valueAsNumber: true })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-800">Specialisations</label>
                <div className="flex flex-wrap gap-2">
                  {contractorSpecialisations.map((item) => {
                    const isSelected = selectedSpecialisations.includes(item)
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() =>
                          form.setValue(
                            'specialisations',
                            toggleValue(selectedSpecialisations, item) as RegisterInput['specialisations'],
                            { shouldValidate: true, shouldDirty: true }
                          )
                        }
                        className={`rounded-full px-3 py-1.5 text-sm ${
                          isSelected
                            ? 'bg-orange-100 text-[#E8590C]'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">Areas you serve</label>
                <input
                  type="text"
                  placeholder="Hyderabad, Secunderabad"
                  {...form.register('service_cities')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">About you</label>
                <textarea
                  maxLength={300}
                  rows={4}
                  {...form.register('bio')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
                {form.formState.errors.bio?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.bio.message}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {selectedRole === 'worker' ? (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Worker details</h2>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">Your trade*</label>
                <select
                  {...form.register('trade')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                >
                  <option value="">Select your trade</option>
                  {workerTrades.map((trade) => (
                    <option key={trade} value={trade}>
                      {trade}
                    </option>
                  ))}
                </select>
                {form.formState.errors.trade?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.trade.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">Years of experience</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  {...form.register('years_experience', { valueAsNumber: true })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">Areas you serve</label>
                <input
                  type="text"
                  placeholder="Hyderabad, Secunderabad"
                  {...form.register('service_cities')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>
            </section>
          ) : null}

          {selectedRole === 'supplier' ? (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Supplier details</h2>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">Shop name*</label>
                <input
                  type="text"
                  {...form.register('shop_name')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
                {form.formState.errors.shop_name?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.shop_name.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">Shop address*</label>
                <input
                  type="text"
                  {...form.register('shop_address')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
                {form.formState.errors.shop_address?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.shop_address.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-800">What you sell</label>
                <div className="flex flex-wrap gap-2">
                  {supplierCategories.map((item) => {
                    const isSelected = selectedCategories.includes(item)
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() =>
                          form.setValue(
                            'category_tags',
                            toggleValue(selectedCategories, item) as RegisterInput['category_tags'],
                            { shouldValidate: true, shouldDirty: true }
                          )
                        }
                        className={`rounded-full px-3 py-1.5 text-sm ${
                          isSelected
                            ? 'bg-orange-100 text-[#E8590C]'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800">WhatsApp number</label>
                <input
                  type="text"
                  {...form.register('whatsapp_number')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
                />
                {form.formState.errors.whatsapp_number?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.whatsapp_number.message}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

          <Button
            type="submit"
            disabled={isContinueDisabled || isSubmitting}
            className="h-12 w-full rounded-lg bg-[#E8590C] text-base font-semibold text-white hover:bg-[#cf4e09]"
          >
            {isSubmitting ? 'Creating profile...' : 'Create Profile'}
          </Button>
        </form>
      </div>
    </div>
  )
}
