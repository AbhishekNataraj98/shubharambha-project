'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowRight, Camera, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

export type PaymentFormData = {
  amount: number
  category: 'labour' | 'material' | 'contractor_fee' | 'other'
  paid_to: string
  payment_mode: 'cash' | 'upi' | 'bank_transfer' | 'cheque'
  paid_at: string
  description?: string
  receipt_url?: string
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

const categories: Array<{ id: PaymentFormData['category']; label: string; icon: string }> = [
  { id: 'labour', label: 'Labour', icon: '👷' },
  { id: 'material', label: 'Material', icon: '🧱' },
  { id: 'contractor_fee', label: 'Contractor', icon: '🏗️' },
  { id: 'other', label: 'Other', icon: '📦' },
]

const modes: PaymentFormData['payment_mode'][] = ['cash', 'upi', 'bank_transfer', 'cheque']

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
  const [category, setCategory] = useState<PaymentFormData['category'] | null>(prefillData?.category ?? null)
  const [paidTo, setPaidTo] = useState(prefillData?.paid_to ?? '')
  const [paymentMode, setPaymentMode] = useState<PaymentFormData['payment_mode'] | null>(
    prefillData?.payment_mode ?? null
  )
  const [paidAt, setPaidAt] = useState(prefillData?.paid_at ?? new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState(prefillData?.description ?? '')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(prefillData?.receipt_url ?? null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const amount = Number(amountInput || '0')
  const canSubmit = amount > 0 && Boolean(category) && paidTo.trim().length >= 2 && Boolean(paymentMode) && Boolean(paidAt)

  const prettyAmount = useMemo(() => {
    if (!amount || Number.isNaN(amount)) return '₹0'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount)
  }, [amount])

  const uploadReceipt = async () => {
    if (!receiptFile) return null
    const formData = new FormData()
    formData.append('file', receiptFile)
    formData.append('folder', 'shubharambha/payments')
    const response = await fetch('/api/upload/photo', {
      method: 'POST',
      body: formData,
    })
    const payload = (await response.json()) as { url?: string; error?: string }
    if (!response.ok || !payload.url) {
      throw new Error(payload.error ?? 'Failed to upload receipt')
    }
    return payload.url
  }

  const submit = async () => {
    if (!canSubmit || submitting || !category || !paymentMode) return
    setSubmitting(true)
    try {
      const receiptUrl = await uploadReceipt()
      const response = await fetch(`/api/projects/${projectId}/payments/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          category,
          paid_to: paidTo.trim(),
          payment_mode: paymentMode,
          paid_at: paidAt,
          description: description.trim() || undefined,
          receipt_url: receiptUrl ?? undefined,
          customer_id: customerId,
          contractor_id: contractorId,
        }),
      })
      const payload = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'Failed to record payment')
      }
      toast.success('Payment submitted! Waiting for contractor approval.')
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
            <p className="mb-2 text-sm font-medium text-gray-700">Payment category</p>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((item) => {
                const selected = category === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    className={`rounded-xl px-3 py-2 text-sm ${
                      selected
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 transition hover:bg-gray-200 active:scale-[0.98]'
                    }`}
                  >
                    <span className="mr-1">{item.icon}</span>
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Paid to</p>
            <input
              value={paidTo}
              onChange={(event) => setPaidTo(event.target.value)}
              placeholder="Person or company name"
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:border-orange-400"
            />
            <p className="mt-1 text-xs text-gray-400">Who did you pay this to?</p>
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

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Add receipt photo (optional)</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-24 w-full items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 transition hover:bg-gray-100"
            >
              {receiptPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptPreview} alt="Receipt preview" className="h-20 rounded-lg object-cover" />
              ) : (
                <span className="inline-flex items-center gap-1 text-sm">
                  <Camera className="h-4 w-4" />
                  Tap to add
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                setReceiptFile(file)
                setReceiptPreview(URL.createObjectURL(file))
                event.currentTarget.value = ''
              }}
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
