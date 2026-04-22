'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
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
      <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
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
      <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
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
      <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
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
      <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
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

  // Calculate progress indicator
  const getStep = () => {
    if (!selectedRole) return 1
    if (!watchedName.trim() || !watchedCity.trim() || !/^\d{6}$/.test(watchedPincode)) return 2
    return 3
  }

  return (
    <div className="min-h-screen px-4 py-6" style={{ backgroundColor: '#FFF8F5' }}>
      <div className="mx-auto w-full max-w-md">
        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((step) => {
              const current = getStep()
              const isActive = step <= current
              return (
                <div key={step} className="flex flex-1 flex-col items-center">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full font-semibold text-white transition-colors"
                    style={{
                      backgroundColor: isActive ? '#E8590C' : '#E0D5CC',
                    }}
                  >
                    {step}
                  </div>
                  <p className="mt-2 text-xs font-medium" style={{ color: isActive ? '#E8590C' : '#999' }}>
                    {step === 1 ? 'Role' : step === 2 ? 'Details' : 'Complete'}
                  </p>
                  {step < 3 && (
                    <div
                      className="mt-2 flex-1 h-1 w-full"
                      style={{
                        backgroundColor: isActive ? '#E8590C' : '#E0D5CC',
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>
            Create your profile
          </h1>
          <p className="mt-2 text-sm font-medium" style={{ color: '#7A6F66' }}>
            Tell us about yourself to get started
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Role Selection Section */}
          <section className="space-y-4">
            <label className="block text-sm font-bold" style={{ color: '#1A1A1A' }}>
              What is your role?
            </label>
            <div className="space-y-3">
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
                    className="flex w-full gap-4 rounded-lg border-2 p-4 text-left transition-all"
                    style={{
                      borderColor: isSelected ? '#E8590C' : '#E0D5CC',
                      backgroundColor: isSelected ? '#FFF8F5' : '#FFFFFF',
                    }}
                  >
                    {/* Left border accent */}
                    {isSelected && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                        style={{ backgroundColor: '#E8590C' }}
                      />
                    )}
                    <div
                      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: isSelected ? '#E8590C' : '#E0D5CC', color: 'white' }}
                    >
                      {role.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold" style={{ color: '#1A1A1A' }}>
                        {role.title}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium" style={{ color: '#7A6F66' }}>
                        {role.description}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#E8590C' }}>
                        <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            {form.formState.errors.role?.message ? (
              <p className="text-xs text-red-600">{form.formState.errors.role.message}</p>
            ) : null}
          </section>

          {/* Basic Details Section */}
          <section className="space-y-4" style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '12px', borderTop: '4px solid #E8590C' }}>
            <h2 className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
              Basic Details
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  {...form.register('name')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {form.formState.errors.name?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  City *
                </label>
                <input
                  type="text"
                  {...form.register('city')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {form.formState.errors.city?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.city.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Pincode *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  {...form.register('pincode')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {form.formState.errors.pincode?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.pincode.message}</p>
                ) : null}
              </div>
            </div>
          </section>

          {selectedRole === 'contractor' ? (
            <section className="space-y-4" style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '12px', borderTop: '4px solid #E8590C' }}>
              <h2 className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
                Contractor Details
              </h2>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Years of Experience
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  {...form.register('years_experience', { valueAsNumber: true })}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
              <div>
                <label className="mb-3 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Specialisations
                </label>
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
                        className="rounded-full px-3.5 py-2 text-xs font-semibold transition-all"
                        style={{
                          backgroundColor: isSelected ? '#E8590C' : '#E0D5CC',
                          color: isSelected ? 'white' : '#1A1A1A',
                        }}
                      >
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Areas You Serve
                </label>
                <input
                  type="text"
                  placeholder="Hyderabad, Secunderabad"
                  {...form.register('service_cities')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  About You
                </label>
                <textarea
                  maxLength={300}
                  rows={4}
                  {...form.register('bio')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all resize-none"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {form.formState.errors.bio?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.bio.message}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {selectedRole === 'worker' ? (
            <section className="space-y-4" style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '12px', borderTop: '4px solid #E8590C' }}>
              <h2 className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
                Worker Details
              </h2>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Your Trade *
                </label>
                <select
                  {...form.register('trade')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
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
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Years of Experience
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  {...form.register('years_experience', { valueAsNumber: true })}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Areas You Serve
                </label>
                <input
                  type="text"
                  placeholder="Hyderabad, Secunderabad"
                  {...form.register('service_cities')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            </section>
          ) : null}

          {selectedRole === 'supplier' ? (
            <section className="space-y-4" style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '12px', borderTop: '4px solid #E8590C' }}>
              <h2 className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
                Supplier Details
              </h2>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Shop Name *
                </label>
                <input
                  type="text"
                  {...form.register('shop_name')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {form.formState.errors.shop_name?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.shop_name.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  Shop Address *
                </label>
                <input
                  type="text"
                  {...form.register('shop_address')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {form.formState.errors.shop_address?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.shop_address.message}</p>
                ) : null}
              </div>
              <div>
                <label className="mb-3 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  What You Sell
                </label>
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
                        className="rounded-full px-3.5 py-2 text-xs font-semibold transition-all"
                        style={{
                          backgroundColor: isSelected ? '#E8590C' : '#E0D5CC',
                          color: isSelected ? 'white' : '#1A1A1A',
                        }}
                      >
                        {item}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold" style={{ color: '#1A1A1A' }}>
                  WhatsApp Number
                </label>
                <input
                  type="text"
                  {...form.register('whatsapp_number')}
                  className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: '#1A1A1A',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#E8590C'
                    e.target.style.boxShadow = '0 0 0 3px rgba(232, 89, 12, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {form.formState.errors.whatsapp_number?.message ? (
                  <p className="mt-1 text-xs text-red-600">{form.formState.errors.whatsapp_number.message}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {apiError ? (
            <div className="rounded-lg px-4 py-3 text-sm font-medium text-red-700" style={{ backgroundColor: '#FFE5E5' }}>
              {apiError}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isContinueDisabled || isSubmitting}
            className="w-full rounded-lg py-3.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: '#E8590C' }}
          >
            {isSubmitting ? 'Creating profile...' : 'Create Profile'}
          </Button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
            By continuing you agree to our{' '}
            <a href="#" className="underline hover:opacity-80" style={{ color: '#1A1A1A' }}>
              Terms
            </a>
            {' & '}
            <a href="#" className="underline hover:opacity-80" style={{ color: '#1A1A1A' }}>
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
