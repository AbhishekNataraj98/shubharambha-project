'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const formSchema = z.object({
  total_contract_amount: z.number().positive(),
  built_up_area_sqft: z.number().positive(),
  number_of_floors: z.enum(['G', 'G+1', 'G+2', 'G+3']),
  start_date: z.string().date(),
  expected_end_date: z.string().date(),
  agreed_cement_rate: z.number().positive(),
  agreed_steel_rate: z.number().positive(),
  escalation_threshold_percent: z.number().positive(),
  payment_schedule: z
    .array(z.object({ stage: z.string(), label: z.string(), percentage: z.number().positive() }))
    .min(1),
  category_budget: z.record(z.string(), z.number().nonnegative()).optional(),
})

type FormValues = z.infer<typeof formSchema>

type ScheduleItem = {
  stage: string
  label: string
  percentage: number
}

type FinancialSetupFormProps = {
  projectId: string
  defaultSchedule: ScheduleItem[]
  existingFinancials?: Partial<FormValues>
  onSuccess: () => void
}

const CATEGORIES = [
  'Structure & Concrete',
  'Masonry & Brickwork',
  'Wood Works',
  'Flooring',
  'Plumbing & Sanitary',
  'Electrical',
  'Finishing & Painting',
] as const

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export default function FinancialSetupForm({
  projectId,
  defaultSchedule,
  existingFinancials,
  onSuccess,
}: FinancialSetupFormProps) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      total_contract_amount: existingFinancials?.total_contract_amount ?? 0,
      built_up_area_sqft: existingFinancials?.built_up_area_sqft ?? 0,
      number_of_floors: existingFinancials?.number_of_floors ?? 'G+2',
      start_date: existingFinancials?.start_date ?? '',
      expected_end_date: existingFinancials?.expected_end_date ?? '',
      agreed_cement_rate: existingFinancials?.agreed_cement_rate ?? 400,
      agreed_steel_rate: existingFinancials?.agreed_steel_rate ?? 65,
      escalation_threshold_percent: existingFinancials?.escalation_threshold_percent ?? 10,
      payment_schedule: existingFinancials?.payment_schedule ?? defaultSchedule,
      category_budget: existingFinancials?.category_budget,
    },
  })

  const values = form.watch()
  const scheduleTotal = useMemo(
    () => (values.payment_schedule ?? []).reduce((sum, row) => sum + Number(row.percentage || 0), 0),
    [values.payment_schedule]
  )
  const categoryTotal = useMemo(
    () =>
      Object.values(values.category_budget ?? {}).reduce(
        (sum, row) => sum + Number(typeof row === 'number' ? row : 0),
        0
      ),
    [values.category_budget]
  )

  const submit = form.handleSubmit(async (payload) => {
    if (Math.abs(scheduleTotal - 100) > 0.001) {
      toast.error('Payment schedule must total 100%')
      return
    }
    if (payload.category_budget && Object.keys(payload.category_budget).length > 0 && Math.abs(categoryTotal - 100) > 0.001) {
      toast.error('Category budget must total 100%')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/financials/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !json.success) throw new Error(json.error ?? 'Failed to save')
      toast.success('Financial plan saved')
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  })

  const amountPerSqft =
    values.total_contract_amount > 0 && values.built_up_area_sqft > 0
      ? values.total_contract_amount / values.built_up_area_sqft
      : 0

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-orange-100 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
        {[1, 2, 3, 4].map((current) => (
          <div key={current} className="flex flex-1 items-center gap-2">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                current <= step ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {current}
            </span>
            {current < 4 ? <span className="h-[2px] flex-1 bg-gray-200" /> : null}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-gray-900">Project financial agreement</h3>
          <p className="text-sm text-gray-500">This helps track estimated vs actual costs</p>
          <label className="block text-sm font-medium text-gray-700">Total contract amount</label>
          <div className="rounded-xl border border-orange-200 px-4 py-3">
            <div className="flex items-center justify-center gap-2">
              <span className="text-lg font-semibold text-orange-600">₹</span>
              <input
                type="number"
                className="w-full bg-transparent text-center text-3xl font-bold outline-none"
                placeholder="0"
                value={values.total_contract_amount || ''}
                onChange={(e) => form.setValue('total_contract_amount', Number(e.target.value || 0))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Built up area (sqft)</label>
              <input
                type="number"
                className="h-11 w-full rounded-lg border border-gray-200 px-3"
                value={values.built_up_area_sqft || ''}
                onChange={(e) => form.setValue('built_up_area_sqft', Number(e.target.value || 0))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Floors</label>
              <div className="grid grid-cols-4 gap-1">
                {(['G', 'G+1', 'G+2', 'G+3'] as const).map((floor) => (
                  <button
                    key={floor}
                    type="button"
                    onClick={() => form.setValue('number_of_floors', floor)}
                    className={`h-10 rounded-full text-xs font-semibold ${
                      values.number_of_floors === floor ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {floor}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Start date</label>
              <input
                type="date"
                className="h-11 w-full rounded-lg border border-gray-200 px-3"
                value={values.start_date}
                onChange={(e) => form.setValue('start_date', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Expected completion</label>
              <input
                type="date"
                className="h-11 w-full rounded-lg border border-gray-200 px-3"
                value={values.expected_end_date}
                onChange={(e) => form.setValue('expected_end_date', e.target.value)}
              />
            </div>
          </div>
          {amountPerSqft > 0 ? (
            <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-700">
              {inr.format(amountPerSqft)}/sqft - {amountPerSqft < 2000 ? 'below market range' : amountPerSqft > 2500 ? 'above market range' : 'within market range (₹2,000-2,500/sqft)'}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-gray-900">Agreed material rates</h3>
          <p className="text-sm text-gray-500">We track these to alert you if prices rise</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Cement rate (₹/bag)</label>
              <input
                type="number"
                className="h-11 w-full rounded-lg border border-gray-200 px-3"
                value={values.agreed_cement_rate}
                onChange={(e) => form.setValue('agreed_cement_rate', Number(e.target.value || 0))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Steel rate (₹/kg)</label>
              <input
                type="number"
                className="h-11 w-full rounded-lg border border-gray-200 px-3"
                value={values.agreed_steel_rate}
                onChange={(e) => form.setValue('agreed_steel_rate', Number(e.target.value || 0))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Alert me if prices rise more than (%)</label>
            <input
              type="number"
              className="h-11 w-full rounded-lg border border-gray-200 px-3"
              value={values.escalation_threshold_percent}
              onChange={(e) => form.setValue('escalation_threshold_percent', Number(e.target.value || 0))}
            />
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            If cement or steel prices rise above this threshold, the extra cost is typically payable by the owner as per most agreements.
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-gray-900">Payment schedule</h3>
          <p className="text-sm text-gray-500">14 stage-wise payments as per your agreement</p>
          <button
            type="button"
            className="rounded-full border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-600"
            onClick={() => form.setValue('payment_schedule', defaultSchedule)}
          >
            Use standard schedule
          </button>
          <div className="space-y-2">
            {(values.payment_schedule ?? []).map((item, index) => {
              const amount = (Number(item.percentage || 0) / 100) * Number(values.total_contract_amount || 0)
              return (
                <div key={item.stage} className="grid grid-cols-[1fr_80px_110px] items-center gap-2 rounded-lg border border-gray-100 p-2">
                  <p className="text-sm font-medium text-gray-700">{item.label}</p>
                  <input
                    type="number"
                    className="h-9 rounded-md border border-gray-200 px-2 text-sm"
                    value={item.percentage}
                    onChange={(e) => {
                      const next = [...(values.payment_schedule ?? [])]
                      next[index] = { ...next[index], percentage: Number(e.target.value || 0) }
                      form.setValue('payment_schedule', next)
                    }}
                  />
                  <p className="text-right text-xs text-gray-500">{inr.format(amount)}</p>
                </div>
              )
            })}
          </div>
          <p className={`text-sm font-semibold ${Math.abs(scheduleTotal - 100) < 0.001 ? 'text-green-600' : 'text-red-600'}`}>
            Total: {scheduleTotal.toFixed(1)}%
          </p>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-gray-900">Budget by category</h3>
          <p className="text-sm text-gray-500">Optional - helps track spending by type</p>
          <button
            type="button"
            className="text-xs font-semibold text-orange-600"
            onClick={() => form.setValue('category_budget', {})}
          >
            Skip this step
          </button>
          <div className="space-y-2">
            {CATEGORIES.map((category) => (
              <div key={category} className="grid grid-cols-[1fr_90px] items-center gap-2">
                <p className="text-sm text-gray-700">{category}</p>
                <input
                  type="number"
                  className="h-9 rounded-md border border-gray-200 px-2 text-sm"
                  value={values.category_budget?.[category] ?? ''}
                  onChange={(e) =>
                    form.setValue('category_budget', {
                      ...(values.category_budget ?? {}),
                      [category]: Number(e.target.value || 0),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <p className={`text-sm font-semibold ${categoryTotal === 0 || Math.abs(categoryTotal - 100) < 0.001 ? 'text-green-600' : 'text-red-600'}`}>
            Total: {categoryTotal.toFixed(1)}%
          </p>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => setStep((prev) => Math.max(1, prev - 1))}>
          Back
        </Button>
        {step < 4 ? (
          <Button
            type="button"
            onClick={() => {
              if (step === 3 && Math.abs(scheduleTotal - 100) > 0.001) return
              setStep((prev) => Math.min(4, prev + 1))
            }}
          >
            Next
          </Button>
        ) : (
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save financial plan'}
          </Button>
        )}
      </div>
    </form>
  )
}
