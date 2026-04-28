import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { apiGet, apiPost } from '@/lib/api'
import { formatINR } from '@/lib/utils'
import { ProjectHeroAndStage } from '@/components/project-detail/ProjectChrome'
import type { DetailTab, PaymentFormData, PaymentItem, PaymentsFilter } from '@/components/project-detail/types'

const BRAND = '#E8590C'

type PaymentsTabProps = {
  projectId: string
  currentUserId: string
  currentUserRole: 'customer' | 'contractor' | 'worker'
  contractorId: string | null
  customerId: string
  focusPaymentId?: string
  activeTab: DetailTab
  onTabChange: (t: DetailTab) => void
  listHeaderProps: {
    projectName: string
    address: string
    city: string
    status: string
    currentStage: string
    customerName: string
    contractorName: string
    professionalName?: string
    professionalRole?: 'worker' | 'contractor' | null
    onPressProfessional?: () => void
    contractorAssigned?: boolean
    hideStageTracker?: boolean
    showReportsTab?: boolean
  }
}

function modeLabel(mode: PaymentItem['paymentMode']): string {
  if (mode === 'bank_transfer') return 'Bank Transfer'
  return mode.toUpperCase()
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
}

function monthLabel(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase()
}

function categoryVisual(category: PaymentItem['paidToCategory']): { label: string; badge: string; bg: string; fg: string } {
  if (category === 'labour') return { label: 'Labour Payment', badge: 'L', bg: '#DBEAFE', fg: '#2563EB' }
  if (category === 'material') return { label: 'Material Payment', badge: 'M', bg: '#D1FAE5', fg: '#059669' }
  if (category === 'contractor_fee') return { label: 'Contractor Payment', badge: 'C', bg: '#FFEDD5', fg: BRAND }
  return { label: 'Other Payment', badge: 'O', bg: '#F3F4F6', fg: '#4B5563' }
}

type MonthGroup = { month: string; items: PaymentItem[] }

export function PaymentsTab({
  projectId,
  currentUserId,
  currentUserRole,
  contractorId,
  customerId,
  focusPaymentId,
  activeTab,
  onTabChange,
  listHeaderProps,
}: PaymentsTabProps) {
  const channelSuffixRef = useRef(Math.random().toString(36).slice(2))
  const listRef = useRef<FlatList<{ type: 'month'; month: string } | { type: 'payment'; payment: PaymentItem }>>(null)
  const hasFocusedRef = useRef(false)
  const [highlightedPaymentId, setHighlightedPaymentId] = useState<string | null>(null)
  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<PaymentsFilter>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [prefill, setPrefill] = useState<Partial<PaymentFormData> | undefined>()
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null)
  const [confirmDeclineId, setConfirmDeclineId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const loadPayments = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await apiGet<{ payments?: PaymentItem[]; error?: string }>(`/api/projects/${projectId}/payments`)
      setPayments(payload.payments ?? [])
    } catch (e) {
      Alert.alert('Payments', e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadPayments()
  }, [loadPayments])

  useEffect(() => {
    const channelName = `payments:${projectId}:${channelSuffixRef.current}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `project_id=eq.${projectId}` }, () => {
        void loadPayments()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadPayments, projectId])

  const normalizedPayments = useMemo(() => {
    if (currentUserRole !== 'contractor' && currentUserRole !== 'worker') return payments
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
    const groups: MonthGroup[] = []
    for (const item of filteredPayments) {
      const month = monthLabel(item.paidAt || item.createdAt)
      const existing = groups.find((g) => g.month === month)
      if (existing) existing.items.push(item)
      else groups.push({ month, items: [item] })
    }
    return groups
  }, [filteredPayments])

  const flatRows = useMemo(() => {
    const rows: Array<{ type: 'month'; month: string } | { type: 'payment'; payment: PaymentItem }> = []
    for (const g of groupedByMonth) {
      rows.push({ type: 'month', month: g.month })
      for (const p of g.items) rows.push({ type: 'payment', payment: p })
    }
    return rows
  }, [groupedByMonth])

  useEffect(() => {
    if (!focusPaymentId || hasFocusedRef.current || flatRows.length === 0) return
    const targetIndex = flatRows.findIndex((row) => row.type === 'payment' && row.payment.id === focusPaymentId)
    if (targetIndex < 0) return
    hasFocusedRef.current = true
    setHighlightedPaymentId(focusPaymentId)
    setTimeout(() => {
      listRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.2 })
    }, 120)
  }, [flatRows, focusPaymentId])

  useEffect(() => {
    if (!highlightedPaymentId) return
    const t = setTimeout(() => setHighlightedPaymentId(null), 2200)
    return () => clearTimeout(t)
  }, [highlightedPaymentId])

  const counts = useMemo(() => {
    const confirmed = normalizedPayments.filter((p) => p.status === 'confirmed').length
    const pending = normalizedPayments.filter((p) => p.status === 'pending_confirmation').length
    const declined = normalizedPayments.filter((p) => p.status === 'declined' || p.status === 'rejected').length
    return { all: normalizedPayments.length, confirmed, pending, declined }
  }, [normalizedPayments])

  const filterPills: Array<{ id: PaymentsFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'confirmed', label: 'Confirmed', count: counts.confirmed },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'declined', label: 'Declined', count: counts.declined },
  ]

  const respondToPayment = async (paymentId: string, action: 'approve' | 'decline', reason?: string) => {
    setActionLoadingId(paymentId)
    try {
      const payload = await apiPost<{ success?: boolean; error?: string }>(`/api/projects/${projectId}/payments/respond`, {
        payment_id: paymentId,
        action,
        reason,
      })
      if (!payload.success) throw new Error(payload.error ?? 'Failed')
      setConfirmApproveId(null)
      setConfirmDeclineId(null)
      setDeclineReason('')
      await loadPayments()
    } catch (e) {
      Alert.alert('Payment', e instanceof Error ? e.message : 'Failed')
    } finally {
      setActionLoadingId(null)
    }
  }

  const canRecordPayment = currentUserRole === 'customer'

  const onRefresh = async () => {
    setRefreshing(true)
    await loadPayments()
    setRefreshing(false)
  }

  const listHeader = (
    <View>
      <ProjectHeroAndStage
        projectName={listHeaderProps.projectName}
        address={listHeaderProps.address}
        city={listHeaderProps.city}
        status={listHeaderProps.status}
        currentStage={listHeaderProps.currentStage}
        customerName={listHeaderProps.customerName}
        contractorName={listHeaderProps.contractorName}
        professionalName={listHeaderProps.professionalName}
        professionalRole={listHeaderProps.professionalRole}
        onPressProfessional={listHeaderProps.onPressProfessional}
        contractorAssigned={listHeaderProps.contractorAssigned}
        hideStageTracker={listHeaderProps.hideStageTracker}
        showReportsTab={listHeaderProps.showReportsTab}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
      <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#111827' }}>
        <Text style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8 }}>Total Paid</Text>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginTop: 2 }}>{formatINR(summary.confirmed)}</Text>
        <View style={{ height: 1, backgroundColor: '#374151', marginVertical: 8 }} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: '#9CA3AF' }}>Confirmed</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#34D399', marginTop: 2 }}>{formatINR(summary.confirmed)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: '#9CA3AF' }}>Pending</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#FBBF24', marginTop: 2 }}>{formatINR(summary.pending)}</Text>
          </View>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 8, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {filterPills.map((pill) => {
            const active = filter === pill.id
            return (
              <TouchableOpacity
                key={pill.id}
                onPress={() => setFilter(pill.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  minHeight: 48,
                  backgroundColor: active ? BRAND : '#F3F4F6',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : '#4B5563' }}>{pill.label}</Text>
                <View style={{ borderRadius: 8, paddingHorizontal: 6, backgroundColor: active ? 'rgba(255,255,255,0.25)' : '#FFFFFF' }}>
                  <Text style={{ fontSize: 11, color: active ? '#FFFFFF' : '#4B5563' }}>{pill.count}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )

  if (loading) {
    return (
      <View style={{ flex: 1, paddingTop: 24 }}>
        {listHeader}
        <ActivityIndicator color={BRAND} style={{ marginTop: 24 }} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {listHeader}
      <FlatList
        ref={listRef}
        data={flatRows}
        keyExtractor={(r, i) => (r.type === 'month' ? `m-${r.month}-${i}` : r.payment.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={BRAND} />}
        contentContainerStyle={{ paddingBottom: 120 }}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 })
          }, 250)
        }}
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#4B5563' }}>No payments recorded yet</Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: '#9CA3AF' }}>
              {canRecordPayment ? 'Tap + to record a payment' : 'Payments will appear here once confirmed'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'month') {
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1.2 }}>{item.month}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
              </View>
            )
          }
          const payment = item.payment
          const normalizedStatus = payment.status === 'rejected' ? 'declined' : payment.status
          const visual = categoryVisual(payment.paidToCategory)
          const professionalNeedsAction =
            (currentUserRole === 'contractor' || currentUserRole === 'worker') &&
            payment.status === 'pending_confirmation' &&
            payment.paidToId === currentUserId
          const isPending = normalizedStatus === 'pending_confirmation'
          const isConfirmed = normalizedStatus === 'confirmed'
          const isDeclined = normalizedStatus === 'declined'
          const isHighlighted = highlightedPaymentId === payment.id
          const pendingRoleLabel =
            payment.paidToRole === 'worker'
              ? 'worker'
              : payment.paidToRole === 'contractor'
                ? 'contractor'
                : 'professional'

          const borderLeft = isPending ? (professionalNeedsAction ? BRAND : '#F59E0B') : isDeclined ? '#EF4444' : '#10B981'
          const baseBg = isPending ? (professionalNeedsAction ? '#FFFFFF' : '#FFFBEB') : isDeclined ? '#FEF2F2' : '#FFFFFF'
          const bg = isHighlighted ? '#FFF7ED' : baseBg

          return (
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 12,
                borderRadius: 16,
                borderLeftWidth: 4,
                borderLeftColor: isHighlighted ? '#E8590C' : borderLeft,
                backgroundColor: bg,
                padding: 14,
                borderWidth: isHighlighted ? 2 : professionalNeedsAction ? 2 : 1,
                borderColor: isHighlighted ? '#E8590C' : professionalNeedsAction ? '#FDBA74' : '#F3F4F6',
              }}
            >
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: visual.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '800', color: visual.fg }}>{visual.badge}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 }}>{visual.label}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>{formatINR(payment.amount)}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    {professionalNeedsAction ? `Recorded by: ${payment.recordedByName}` : `Paid to: ${payment.paidToName}`}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>
                    Via: {modeLabel(payment.paymentMode)} · {formatDate(payment.paidAt)}
                  </Text>
                  {payment.description ? (
                    <Text style={{ marginTop: 6, fontSize: 13, color: '#4B5563', fontStyle: 'italic' }}>&quot;{payment.description}&quot;</Text>
                  ) : null}
                  {isPending && !professionalNeedsAction ? (
                    <View style={{ marginTop: 10, borderRadius: 10, padding: 10, backgroundColor: '#FEF3C7' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#92400E' }}>{`⏳ Waiting for ${pendingRoleLabel} approval`}</Text>
                    </View>
                  ) : null}
                  {professionalNeedsAction ? (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <TouchableOpacity
                        onPress={() => setConfirmApproveId(payment.id)}
                        disabled={actionLoadingId === payment.id}
                        style={{ flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setConfirmDeclineId(payment.id)}
                        disabled={actionLoadingId === payment.id}
                        style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: '#DC2626', fontWeight: '700' }}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {isConfirmed ? (
                    <Text style={{ marginTop: 10, fontSize: 12, fontWeight: '600', color: '#059669' }}>✓ Confirmed</Text>
                  ) : null}
                  {isDeclined && currentUserRole === 'customer' ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626' }}>✗ Declined</Text>
                      {payment.declineReason ? <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Reason: {payment.declineReason}</Text> : null}
                      <TouchableOpacity
                        onPress={() => {
                          setPrefill({
                            amount: payment.amount,
                            category: payment.paidToCategory,
                            paid_to: payment.paidToName,
                            payment_mode: payment.paymentMode,
                            paid_at: payment.paidAt.slice(0, 10),
                            description: payment.description ?? undefined,
                            receipt_url: payment.receiptUrl ?? undefined,
                          })
                          setSheetOpen(true)
                        }}
                        style={{ marginTop: 10, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' }}
                      >
                        <Text style={{ fontWeight: '600', color: '#374151' }}>Edit & Resubmit</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          )
        }}
      />

      {canRecordPayment ? (
        <TouchableOpacity
          onPress={() => {
            setPrefill(undefined)
            setSheetOpen(true)
          }}
          style={{
            position: 'absolute',
            right: 20,
            bottom: 28,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: BRAND,
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 4,
          }}
        >
          <Text style={{ fontSize: 28, color: '#FFFFFF' }}>+</Text>
        </TouchableOpacity>
      ) : null}

      <LogPaymentModal
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projectId={projectId}
        customerId={customerId}
        contractorId={contractorId ?? ''}
        prefill={prefill}
        onSuccess={() => void loadPayments()}
      />

      <Modal visible={Boolean(confirmApproveId)} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}>
          <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>Confirm approval?</Text>
            <Text style={{ marginTop: 8, color: '#6B7280' }}>This will record the payment as confirmed.</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <TouchableOpacity onPress={() => setConfirmApproveId(null)} style={{ minHeight: 48, justifyContent: 'center' }}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => confirmApproveId && void respondToPayment(confirmApproveId, 'approve')}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#10B981', borderRadius: 10 }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(confirmDeclineId)} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}>
          <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>Decline payment</Text>
            <Text style={{ marginTop: 8, color: '#6B7280' }}>Reason (optional)</Text>
            <TextInput
              value={declineReason}
              onChangeText={setDeclineReason}
              placeholder="Amount doesn't match"
              style={{ marginTop: 10, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, minHeight: 48 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <TouchableOpacity
                onPress={() => {
                  setConfirmDeclineId(null)
                  setDeclineReason('')
                }}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => confirmDeclineId && void respondToPayment(confirmDeclineId, 'decline', declineReason.trim() || undefined)}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#EF4444', borderRadius: 10 }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
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

function LogPaymentModal({
  visible,
  onClose,
  projectId,
  customerId,
  contractorId,
  prefill,
  onSuccess,
}: {
  visible: boolean
  onClose: () => void
  projectId: string
  customerId: string
  contractorId: string
  prefill?: Partial<PaymentFormData>
  onSuccess: () => void
}) {
  const [amountInput, setAmountInput] = useState('')
  const [category] = useState<'contractor_fee'>('contractor_fee')
  const [paidTo] = useState('')
  const [paymentStage, setPaymentStage] = useState<PaymentFormData['payment_stage'] | null>(null)
  const [paymentMode, setPaymentMode] = useState<PaymentFormData['payment_mode'] | null>(null)
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!visible) return
    setAmountInput(prefill?.amount ? String(prefill.amount) : '')
    setPaymentStage(prefill?.payment_stage ?? null)
    setPaymentStage(prefill?.payment_stage ?? null)
    setPaymentMode(prefill?.payment_mode ?? null)
    setPaidAt(prefill?.paid_at ?? new Date().toISOString().slice(0, 10))
    setDescription(prefill?.description ?? '')
  }, [visible, prefill])

  const amount = Number(amountInput || '0')
  const canSubmit =
    amount > 0 && Boolean(paymentStage) && Boolean(paymentMode) && Boolean(paidAt)

  const submit = async () => {
    if (!canSubmit || submitting || !category || !paymentMode || !paymentStage) return
    setSubmitting(true)
    try {
      const payload = await apiPost<{ success?: boolean; error?: string }>(`/api/projects/${projectId}/payments/record`, {
        amount,
        category,
        payment_stage: paymentStage,
        payment_mode: paymentMode,
        paid_at: paidAt,
        description: description.trim() || undefined,
        customer_id: customerId,
        contractor_id: contractorId,
      })
      if (!payload.success) throw new Error(payload.error ?? 'Failed')
      Alert.alert('Success', 'Payment submitted! Waiting for approval.')
      onSuccess()
      onClose()
    } catch (e) {
      Alert.alert('Payment', e instanceof Error ? e.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!visible) return null

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', padding: 16, maxHeight: '88%' }}>
          <View style={{ alignSelf: 'center', width: 48, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>Record Payment</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 22, color: '#6B7280' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Amount (₹)</Text>
            <TextInput
              keyboardType="number-pad"
              value={amountInput}
              onChangeText={(t) => setAmountInput(t.replace(/[^\d]/g, ''))}
              placeholder="0"
              style={{ fontSize: 32, fontWeight: '800', textAlign: 'center', borderRadius: 16, backgroundColor: '#F9FAFB', padding: 16 }}
            />
            <Text style={{ fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 }}>Payment stage (for reports)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {paymentStages.map((s) => {
                const sel = paymentStage === s.value
                return (
                  <TouchableOpacity
                    key={s.value}
                    onPress={() => setPaymentStage(s.value)}
                    style={{
                      minHeight: 40,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor: sel ? BRAND : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontWeight: '600', color: sel ? '#FFFFFF' : '#374151', fontSize: 11 }}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 }}>Payment mode</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {modes.map((m) => {
                const sel = paymentMode === m
                const label = m === 'bank_transfer' ? 'Bank' : m.toUpperCase()
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setPaymentMode(m)}
                    style={{
                      minHeight: 48,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: sel ? BRAND : '#F3F4F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontWeight: '600', color: sel ? '#FFFFFF' : '#374151', fontSize: 12 }}>{label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 }}>Payment date</Text>
            <TextInput value={paidAt} onChangeText={setPaidAt} placeholder="YYYY-MM-DD" style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, minHeight: 48 }} />
            <Text style={{ fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 }}>Description (optional)</Text>
            <TextInput value={description} onChangeText={setDescription} multiline style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, minHeight: 72, textAlignVertical: 'top' }} />
            <TouchableOpacity
              onPress={() => void submit()}
              disabled={!canSubmit || submitting}
              style={{
                marginTop: 20,
                minHeight: 52,
                borderRadius: 16,
                backgroundColor: canSubmit && !submitting ? BRAND : '#D1D5DB',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{submitting ? 'Submitting…' : 'Submit for Approval'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
