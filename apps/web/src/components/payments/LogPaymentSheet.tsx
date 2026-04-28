'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

export type PaymentFormData = {
  amount: number
  category?: 'labour' | 'material' | 'contractor_fee' | 'other'
  paid_to?: string
  payment_stage:
    | 'advance'
    | 'plinth'
    | 'brickwork'
    | 'woodwork'
    | 'gf_lintel'
    | 'gf_roof'
    | 'ff_lintel'
    | 'ff_roof'
    | 'sf_lintel'
    | 'sf_rcc'
    | 'plastering'
    | 'flooring'
    | 'painting'
    | 'completion'
  payment_mode: 'cash' | 'upi' | 'bank_transfer' | 'cheque'
  paid_at: string
  description?: string
}

type LogPaymentSheetProps = {
  projectId: string
  customerId: string
  contractorId: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  prefillData?: Partial<PaymentFormData>
}

const modes: PaymentFormData['payment_mode'][] = ['cash', 'upi', 'bank_transfer', 'cheque']
const paymentStages: Array<{ value: PaymentFormData['payment_stage']; label: string }> = [
  { value: 'advance', label: 'Advance' },
  { value: 'plinth', label: 'After Plinth Work' },
  { value: 'brickwork', label: 'Brick Work Commencement' },
  { value: 'woodwork', label: 'Wood Work Commencement' },
  { value: 'gf_lintel', label: 'Before GF Lintel' },
  { value: 'gf_roof', label: 'Before GF Roof' },
  { value: 'ff_lintel', label: 'Before FF Lintel' },
  { value: 'ff_roof', label: 'Before FF Roof' },
  { value: 'sf_lintel', label: 'Before SF Lintel' },
  { value: 'sf_rcc', label: 'Before SF RCC' },
  { value: 'plastering', label: 'Before Plastering' },
  { value: 'flooring', label: 'Before Flooring' },
  { value: 'painting', label: 'Before Painting & Wiring' },
  { value: 'completion', label: 'Before Completion' },
]

export default function LogPaymentSheet({
  projectId,
  customerId,
  contractorId,
  isOpen,
  onClose,
  onSuccess,
  prefillData,
}: LogPaymentSheetProps) {
  const [amountInput, setAmountInput] = useState(prefillData?.amount ? String(prefillData.amount) : '')
  const [category] = useState<'contractor_fee'>('contractor_fee')
  const [paidTo] = useState('')
  const [paymentStage, setPaymentStage] = useState<PaymentFormData['payment_stage'] | null>(
    prefillData?.payment_stage ?? null
  )
  const [paymentMode, setPaymentMode] = useState<PaymentFormData['payment_mode'] | null>(
    prefillData?.payment_mode ?? null
  )
  const [paidAt, setPaidAt] = useState(prefillData?.paid_at ?? new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState(prefillData?.description ?? '')
  const [submitting, setSubmitting] = useState(false)

  const amount = Number(amountInput || '0')
  const canSubmit = amount > 0 && Boolean(paymentStage) && Boolean(paymentMode) && Boolean(paidAt)

  const prettyAmount = useMemo(() => {
    if (!amount || Number.isNaN(amount)) return '₹0'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }, [amount])

  const submit = async () => {
    if (!canSubmit || submitting || !category || !paymentMode || !paymentStage) return
    setSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/payments/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          category,
          payment_stage: paymentStage,
          payment_mode: paymentMode,
          paid_at: paidAt,
          description: description.trim() || undefined,
          customer_id: customerId,
          contractor_id: contractorId,
        }),
      })
      const payload = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Failed to record payment')
      }
      toast.success('Payment submitted! Waiting for approval.')
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/35">
      <button type="button" aria-label="Close payment sheet" className="h-full w-full" onClick={onClose} />
      <div className="absolute right-0 bottom-0 left-0 mx-auto w-full max-w-md rounded-t-3xl bg-white p-4 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-200" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pb-2">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Amount (₹)</p>
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-center">
                <p className="text-xs text-gray-400">Enter the amount you paid</p>
                <div className="mt-2 flex items-center justify-center gap-1">
                  <span className="text-2xl font-semibold text-gray-400">₹</span>
                  <input
                    value={amountInput}
                    onChange={(event) => setAmountInput(event.target.value.replace(/[^\d]/g, ''))}
                    placeholder="0"
                    inputMode="numeric"
                    className="w-44 border-none bg-transparent text-center text-3xl font-bold text-gray-900 outline-none"
                  />
                </div>
              </div>
            </div>
            <p className="mt-1 text-center text-xs text-gray-400">{prettyAmount}</p>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Payment stage (for reports)</p>
            <select
              value={paymentStage ?? ''}
              onChange={(event) => setPaymentStage(event.target.value as PaymentFormData['payment_stage'])}
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-orange-400"
            >
              <option value="">Select payment stage</option>
              {paymentStages.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Payment mode</p>
            <div className="flex flex-wrap gap-2">
              {modes.map((mode) => {
                const selected = paymentMode === mode
                const label = mode === 'bank_transfer' ? 'Bank Transfer' : mode.toUpperCase()
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`rounded-full px-3 py-1.5 text-xs ${
                      selected
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600 transition hover:bg-gray-200 active:scale-[0.98]'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Payment date</p>
            <input
              type="date"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-orange-400"
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Description (optional)</p>
            <textarea
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What was this payment for?"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm outline-none focus:border-orange-400"
            />
          </div>

        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit || submitting}
          className={`mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white ${
            !canSubmit || submitting ? 'bg-gray-300' : 'bg-orange-500 transition hover:bg-orange-600 active:scale-[0.99]'
          }`}
        >
          {submitting ? 'Submitting...' : 'Submit for Contractor Approval'}
          {!submitting ? <ArrowRight className="h-4 w-4" /> : <Plus className="h-4 w-4 animate-spin" />}
        </button>
      </div>
    </div>
  )
}
