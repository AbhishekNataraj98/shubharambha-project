'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  IndianRupee,
  Plus,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import LogPaymentSheet, { type PaymentFormData } from '@/components/payments/LogPaymentSheet'
import { useSearchParams } from 'next/navigation'

type PaymentPanelProps = {
  projectId: string
  currentUserId: string
  currentUserRole: 'customer' | 'contractor' | 'worker'
  contractorId: string | null
  customerId: string
}

type PaymentItem = {
  id: string
  amount: number
  paidToCategory: 'labour' | 'material' | 'contractor_fee' | 'other'
  paymentMode: 'cash' | 'upi' | 'bank_transfer' | 'cheque'
  description: string | null
  status: 'pending_confirmation' | 'confirmed' | 'declined' | 'rejected'
  paidToName: string
  receiptUrl: string | null
  paidAt: string
  createdAt: string
  recordedBy: string
  recordedByName: string
  declineReason: string | null
}

type PaymentsFilter = 'all' | 'confirmed' | 'pending' | 'declined'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
}

function monthLabel(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase()
}

function categoryVisual(category: PaymentItem['paidToCategory']) {
  if (category === 'labour') return { label: 'Labour Payment', badge: 'L', className: 'bg-blue-100 text-blue-600' }
  if (category === 'material') return { label: 'Material Payment', badge: 'M', className: 'bg-green-100 text-green-600' }
  if (category === 'contractor_fee') return { label: 'Contractor Payment', badge: 'C', className: 'bg-orange-100 text-orange-600' }
  return { label: 'Other Payment', badge: 'O', className: 'bg-gray-100 text-gray-600' }
}

function modeLabel(mode: PaymentItem['paymentMode']) {
  if (mode === 'bank_transfer') return 'Bank Transfer'
  return mode.toUpperCase()
}

export default function PaymentPanel({
  projectId,
  currentUserId,
  currentUserRole,
  contractorId,
  customerId,
}: PaymentPanelProps) {
  const searchParams = useSearchParams()
  const focusPaymentId = searchParams.get('paymentId')
  const supabase = createClient()
  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PaymentsFilter>('all')
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [prefillData, setPrefillData] = useState<Partial<PaymentFormData> | undefined>()
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null)
  const [confirmDeclineId, setConfirmDeclineId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadPayments = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/payments`)
      const payload = (await response.json()) as { payments?: PaymentItem[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Failed to load payments')
      setPayments(payload.payments ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPayments()
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    const channel = supabase
      .channel(`payments:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `project_id=eq.${projectId}` },
        () => {
          void loadPayments()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const normalizedPayments = useMemo(() => {
    if (currentUserRole !== 'contractor') return payments
    return payments.filter(
      (payment) =>
        payment.status === 'confirmed' ||
        payment.status === 'pending_confirmation' ||
        payment.status === 'declined' ||
        payment.status === 'rejected'
    )
  }, [currentUserRole, payments])

  const summary = useMemo(() => {
    return normalizedPayments.reduce(
      (acc, payment) => {
        const status = payment.status === 'rejected' ? 'declined' : payment.status
        if (status === 'confirmed') acc.confirmed += payment.amount
        if (status === 'pending_confirmation') acc.pending += payment.amount
        if (status === 'declined') acc.declined += payment.amount
        return acc
      },
      { confirmed: 0, pending: 0, declined: 0 }
    )
  }, [normalizedPayments])

  const filteredPayments = useMemo(() => {
    return normalizedPayments.filter((payment) => {
      const status = payment.status === 'rejected' ? 'declined' : payment.status
      if (filter === 'all') return true
      if (filter === 'pending') return status === 'pending_confirmation'
      return status === filter
    })
  }, [filter, normalizedPayments])

  const groupedByMonth = useMemo(() => {
    const groups: Array<{ month: string; items: PaymentItem[] }> = []
    for (const item of filteredPayments) {
      const month = monthLabel(item.paidAt || item.createdAt)
      const existing = groups.find((group) => group.month === month)
      if (existing) {
        existing.items.push(item)
      } else {
        groups.push({ month, items: [item] })
      }
    }
    return groups
  }, [filteredPayments])

  const counts = useMemo(() => {
    const confirmed = normalizedPayments.filter((p) => p.status === 'confirmed').length
    const pending = normalizedPayments.filter((p) => p.status === 'pending_confirmation').length
    const declined = normalizedPayments.filter((p) => p.status === 'declined' || p.status === 'rejected').length
    return { all: normalizedPayments.length, confirmed, pending, declined }
  }, [normalizedPayments])

  const respondToPayment = async (paymentId: string, action: 'approve' | 'decline', reason?: string) => {
    setActionLoadingId(paymentId)
    try {
      const response = await fetch(`/api/projects/${projectId}/payments/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, action, reason }),
      })
      const payload = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !payload.success) throw new Error(payload.error ?? 'Failed to respond')
      toast.success(action === 'approve' ? 'Payment approved' : 'Payment declined')
      setConfirmApproveId(null)
      setConfirmDeclineId(null)
      setDeclineReason('')
      await loadPayments()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update payment')
    } finally {
      setActionLoadingId(null)
    }
  }

  const filterPills: Array<{ id: PaymentsFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'confirmed', label: 'Confirmed', count: counts.confirmed },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'declined', label: 'Declined', count: counts.declined },
  ]

  const canRecordPayment = currentUserRole === 'customer'

  useEffect(() => {
    if (!focusPaymentId) return
    const timer = window.setTimeout(() => {
      const node = document.getElementById(`payment-card-${focusPaymentId}`)
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [focusPaymentId, groupedByMonth.length])

  return (
    <div className="space-y-3 pb-24">
      <div className="rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700 p-5 text-white shadow-lg">
        <p className="text-xs uppercase tracking-wider text-gray-400">Total Paid</p>
        <p className="mt-1 text-3xl font-bold">{formatCurrency(summary.confirmed)}</p>
        <div className="my-3 border-t border-gray-700" />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="inline-flex items-center gap-1 text-xs text-gray-400">
              <CheckCircle2 className="h-3 w-3" /> Confirmed
            </p>
            <p className="text-sm font-semibold text-emerald-400">{formatCurrency(summary.confirmed)}</p>
          </div>
          <div>
            <p className="inline-flex items-center gap-1 text-xs text-gray-400">
              <Clock3 className="h-3 w-3" /> Pending
            </p>
            <p className="text-sm font-semibold text-amber-400">{formatCurrency(summary.pending)}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filterPills.map((pill) => {
          const active = filter === pill.id
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setFilter(pill.id)}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs ${
                active
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 transition hover:bg-gray-200 active:scale-[0.98]'
              }`}
            >
              <span>{pill.label}</span>
              <span className={`rounded-full px-1 ${active ? 'bg-white/20' : 'bg-white'}`}>{pill.count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500">Loading payments...</div>
      ) : groupedByMonth.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
          <IndianRupee className="mx-auto h-16 w-16 text-gray-200" />
          <p className="mt-2 font-medium text-gray-600">No payments recorded yet</p>
          {canRecordPayment ? (
            <p className="mt-1 text-sm text-gray-400">Tap + to record a payment</p>
          ) : (
            <p className="mt-1 text-sm text-gray-400">Payments will appear here once confirmed</p>
          )}
        </div>
      ) : (
        groupedByMonth.map((group) => (
          <div key={group.month}>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-px flex-1 bg-gray-200" />
              <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-400">{group.month}</p>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="space-y-3">
              {group.items.map((payment) => {
                const normalizedStatus = payment.status === 'rejected' ? 'declined' : payment.status
                const visual = categoryVisual(payment.paidToCategory)
                const contractorNeedsAction =
                  currentUserRole === 'contractor' &&
                  payment.status === 'pending_confirmation' &&
                  Boolean(contractorId) &&
                  currentUserId === contractorId

                const isPending = normalizedStatus === 'pending_confirmation'
                const isConfirmed = normalizedStatus === 'confirmed'
                const isDeclined = normalizedStatus === 'declined'

                const wrapperClass = isPending
                  ? contractorNeedsAction
                    ? 'rounded-2xl border-2 border-orange-200 bg-white p-4 shadow-sm transition hover:shadow-md'
                    : 'rounded-2xl border border-amber-200 bg-amber-50 p-4'
                  : isDeclined
                    ? 'rounded-2xl border border-red-100 bg-red-50 p-4'
                    : 'rounded-2xl border border-gray-100 bg-white p-4 transition hover:shadow-sm'

                const accentClass = isPending
                  ? contractorNeedsAction
                    ? 'border-orange-400'
                    : 'border-amber-400'
                  : isDeclined
                    ? 'border-red-400'
                    : 'border-emerald-400'

                return (
                  <div
                    key={payment.id}
                    id={`payment-card-${payment.id}`}
                    className={`${wrapperClass} border-l-4 ${accentClass} relative ${
                      focusPaymentId === payment.id ? 'ring-2 ring-orange-300 ring-offset-2' : ''
                    }`}
                  >
                    {contractorNeedsAction ? (
                      <span className="absolute top-3 right-3 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
                    ) : null}
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${visual.className}`}>
                        {visual.badge}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {contractorNeedsAction ? (
                              <span className="inline-flex items-center gap-1">
                                <BellRing className="h-3.5 w-3.5 text-amber-500" />
                                {visual.label}
                              </span>
                            ) : (
                              visual.label
                            )}
                          </p>
                          <p className="text-lg font-bold text-gray-900">{formatCurrency(payment.amount)}</p>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {contractorNeedsAction ? `Recorded by: ${payment.recordedByName}` : `Paid to: ${payment.paidToName}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          Via: {modeLabel(payment.paymentMode)} · {formatDate(payment.paidAt)}
                        </p>
                        {payment.description ? (
                          <p className="mt-1 text-sm italic text-gray-600">&quot;{payment.description}&quot;</p>
                        ) : null}

                        {isPending && !contractorNeedsAction ? (
                          <div className="mt-3 inline-flex items-center gap-1 rounded-xl bg-amber-100 px-3 py-2 text-xs font-medium text-amber-700">
                            <Clock3 className="h-3.5 w-3.5" />
                            Waiting for contractor approval
                          </div>
                        ) : null}

                        {contractorNeedsAction ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmApproveId(payment.id)}
                              disabled={actionLoadingId === payment.id}
                              className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
                            >
                              <Check className="h-4 w-4" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeclineId(payment.id)}
                              disabled={actionLoadingId === payment.id}
                              className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 active:scale-[0.98] disabled:opacity-60"
                            >
                              <X className="h-4 w-4" />
                              Decline
                            </button>
                          </div>
                        ) : null}

                        {isConfirmed ? (
                          <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Confirmed by contractor
                          </p>
                        ) : null}

                        {isDeclined && currentUserRole === 'customer' ? (
                          <div className="mt-3 space-y-2">
                            <p className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <XCircle className="h-3.5 w-3.5" />
                              Declined by contractor
                            </p>
                            {payment.declineReason ? (
                              <p className="text-xs italic text-gray-500">Reason: {payment.declineReason}</p>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setPrefillData({
                                  amount: payment.amount,
                                  category: payment.paidToCategory,
                                  paid_to: payment.paidToName,
                                  payment_mode: payment.paymentMode,
                                  paid_at: payment.paidAt.slice(0, 10),
                                  description: payment.description ?? undefined,
                                  receipt_url: payment.receiptUrl ?? undefined,
                                })
                                setIsSheetOpen(true)
                              }}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 transition hover:bg-gray-50 active:scale-[0.98]"
                            >
                              Edit &amp; Resubmit
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {canRecordPayment ? (
        <button
          type="button"
          onClick={() => {
            setPrefillData(undefined)
            setIsSheetOpen(true)
          }}
          className="fixed right-4 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition hover:bg-orange-600 active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      ) : null}

      {confirmApproveId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">Confirm payment approval</h3>
            <p className="mt-1 text-sm text-gray-500">This will record the payment as confirmed.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmApproveId(null)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void respondToPayment(confirmApproveId, 'approve')}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-600"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDeclineId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">Decline payment</h3>
            <p className="mt-1 text-sm text-gray-500">Reason for declining (optional)</p>
            <input
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              className="mt-3 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-red-300"
              placeholder="Amount doesn't match"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeclineId(null)
                  setDeclineReason('')
                }}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void respondToPayment(confirmDeclineId, 'decline', declineReason.trim() || undefined)}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-600"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LogPaymentSheet
        projectId={projectId}
        customerId={customerId}
        contractorId={contractorId ?? ''}
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        onSuccess={() => {
          void loadPayments()
        }}
        prefillData={prefillData}
      />
    </div>
  )
}
