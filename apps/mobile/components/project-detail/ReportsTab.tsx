import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { ProjectHeroAndStage } from '@/components/project-detail/ProjectChrome'
import { apiGet, apiPost } from '@/lib/api'
import { getResolvedApiBaseUrl } from '@/lib/getApiBaseUrl'
import type { DetailTab } from '@/components/project-detail/types'
import { FinancialSetupSheet } from '@/components/reports/FinancialSetupSheet'
import { KeyboardSafeView } from '@/lib/keyboardSafe'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type ReportsTabProps = {
  projectId: string
  currentUserRole: 'customer' | 'contractor' | 'worker' | 'supplier'
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
    onPressProjectImages?: () => void
    onPressProjectOverview?: () => void
    contractorAssigned?: boolean
    hideStageTracker?: boolean
    showReportsTab?: boolean
  }
}

type ReportsPayload = {
  hasFinancialSetup: boolean
  chartData?: {
    estimated: Array<{ stage: string; label: string; amount: number; cumulative: number }>
    actual: Array<{ stage: string; label: string; amount: number; cumulative: number }>
  }
  overview?: {
    totalContractAmount: number
    totalEstimatedSoFar: number
    totalActualSpent: number
    variance: number
    varianceLabel: string
    percentComplete: number
    monthsElapsed: number
    totalMonths: number
  }
  stagePayments?: Array<{
    stage: string
    label: string
    expectedAmount: number
    actualPaidAmount: number
    status: 'paid' | 'partial' | 'due' | 'upcoming'
  }>
  escalationAlerts?: Array<{
    material: string
    agreedRate: number
    currentRate: number
    increasePercent: number
    isAboveThreshold: boolean
    estimatedExtraCost: number
  }>
  timeline?: {
    startDate: string
    expectedEndDate: string
    currentStage: string
    monthsElapsed: number
    totalMonths: number
    isDelayed: boolean
    progressPercent: number
  }
  categoryBudget?: Record<string, number> | null
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function ReportsTab({ projectId, currentUserRole, activeTab, onTabChange, listHeaderProps }: ReportsTabProps) {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [report, setReport] = useState<ReportsPayload | null>(null)
  const [showSetupSheet, setShowSetupSheet] = useState(false)
  const [updatingPrices, setUpdatingPrices] = useState(false)
  const [cementRate, setCementRate] = useState('')
  const [steelRate, setSteelRate] = useState('')

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true)
    try {
      const payload = await apiGet<ReportsPayload>(`/api/projects/${projectId}/reports`)
      setReport(payload)
    } catch (error) {
      if (!opts.silent) Alert.alert('Reports', error instanceof Error ? error.message : 'Failed to load reports')
      setReport(null)
    } finally {
      if (!opts.silent) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const categoryRows = useMemo(() => {
    if (!report?.categoryBudget || !report?.overview) return []
    return Object.entries(report.categoryBudget).map(([name, percent]) => ({
      name,
      budgeted: ((percent ?? 0) / 100) * report.overview!.totalContractAmount,
      actual: ((percent ?? 0) / 100) * report.overview!.totalActualSpent,
    }))
  }, [report?.categoryBudget, report?.overview])

  const chartRows = useMemo(() => {
    const stageRows = report?.stagePayments ?? []
    if (stageRows.length > 0) {
      const max = Math.max(
        1,
        ...stageRows.map((row) => Math.max(row.expectedAmount, row.actualPaidAmount))
      )
      return stageRows.map((row) => ({
        label: row.label,
        estimatedPct: (row.expectedAmount / max) * 100,
        actualPct: (row.actualPaidAmount / max) * 100,
        estimated: row.expectedAmount,
        actual: row.actualPaidAmount,
      }))
    }

    const est = report?.chartData?.estimated ?? []
    const act = report?.chartData?.actual ?? []
    const max = Math.max(
      1,
      ...est.map((row) => row.amount),
      ...act.map((row) => row.amount)
    )
    return est.map((row, index) => ({
      label: row.label,
      estimatedPct: (row.amount / max) * 100,
      actualPct: ((act[index]?.amount ?? 0) / max) * 100,
      estimated: row.amount,
      actual: act[index]?.amount ?? 0,
    }))
  }, [report?.chartData?.actual, report?.chartData?.estimated, report?.stagePayments])

  const submitRates = async () => {
    if (!cementRate.trim() && !steelRate.trim()) return
    setUpdatingPrices(true)
    try {
      const payload = await apiPost<{ success?: boolean; error?: string }>(`/api/projects/${projectId}/material-prices`, {
        cement_rate: cementRate.trim() ? Number(cementRate) : undefined,
        steel_rate: steelRate.trim() ? Number(steelRate) : undefined,
      })
      if (!payload.success) throw new Error(payload.error ?? 'Failed to update prices')
      setCementRate('')
      setSteelRate('')
      await load({ silent: true })
      Alert.alert('Success', 'Material prices updated')
    } catch (error) {
      Alert.alert('Update prices', error instanceof Error ? error.message : 'Failed to update prices')
    } finally {
      setUpdatingPrices(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await load({ silent: true })
    setRefreshing(false)
  }

  const openPdfOnWeb = async () => {
    try {
      const base = getResolvedApiBaseUrl()
      const url = `${base}/projects/${projectId}?tab=reports&export=pdf`
      const canOpen = await Linking.canOpenURL(url)
      if (!canOpen) {
        Alert.alert('Unable to open link', 'Please open reports in web app.')
        return
      }
      await Linking.openURL(url)
    } catch {
      Alert.alert('Unable to open link', 'Please open reports in web app.')
    }
  }

  const statusPill = (status: 'paid' | 'partial' | 'due' | 'upcoming') => {
    if (status === 'paid') return { bg: '#DCFCE7', fg: '#166534', border: '#22C55E', label: 'Paid' }
    if (status === 'partial') return { bg: '#FEF3C7', fg: '#92400E', border: '#F59E0B', label: 'Partial' }
    if (status === 'due') return { bg: '#FFEDD5', fg: '#9A3412', border: '#F97316', label: 'Due now' }
    return { bg: '#F2EDE8', fg: '#4B5563', border: '#9CA3AF', label: 'Upcoming' }
  }

  const summaryCards = [
    {
      key: 'contract',
      title: 'Total Contract',
      value: inr.format(report?.overview?.totalContractAmount ?? 0),
      subtitle: 'Contract value',
      bg: '#EDE8E3',
      valueColor: '#111827',
    },
    {
      key: 'estimated',
      title: 'Estimated Spent',
      value: inr.format(report?.overview?.totalEstimatedSoFar ?? 0),
      subtitle: 'Expected so far',
      bg: '#EFF6FF',
      valueColor: '#1D4ED8',
    },
    {
      key: 'actual',
      title: 'Actual Spent',
      value: inr.format(report?.overview?.totalActualSpent ?? 0),
      subtitle: 'Actually paid',
      bg: '#FBF0EB',
      valueColor: '#D85A30',
    },
    {
      key: 'variance',
      title: 'Variance',
      value: inr.format(Math.abs(report?.overview?.variance ?? 0)),
      subtitle: (report?.overview?.variance ?? 0) >= 0 ? 'Under budget' : 'Over budget',
      bg: (report?.overview?.variance ?? 0) >= 0 ? '#ECFDF5' : '#FEF2F2',
      valueColor: (report?.overview?.variance ?? 0) >= 0 ? '#166534' : '#B91C1C',
    },
  ]

  const maxBarWidth = 180

  return (
    <KeyboardSafeView
      includeTopSafeArea={false}
      iosKeyboardOffsetOverride={Platform.OS === 'ios' ? insets.top + 8 : undefined}
    >
    <View style={{ flex: 1 }}>
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
      onPressProjectImages={listHeaderProps.onPressProjectImages}
        onPressProjectOverview={listHeaderProps.onPressProjectOverview}
        contractorAssigned={listHeaderProps.contractorAssigned}
        hideStageTracker={listHeaderProps.hideStageTracker}
        showReportsTab={listHeaderProps.showReportsTab}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#D85A30" />}
      >
        {loading ? (
          <ActivityIndicator color="#D85A30" />
        ) : !report?.hasFinancialSetup ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📈</Text>
            <Text style={styles.emptyTitle}>Set up financial tracking</Text>
            <Text style={styles.emptyText}>
              Track estimated vs actual costs, get alerts when material prices rise, and generate a full payment blueprint PDF.
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (currentUserRole !== 'customer') {
                  Alert.alert('Reports', 'Only the customer can set up financial tracking for this project.')
                  return
                }
                setShowSetupSheet(true)
              }}
              style={styles.setupButton}
            >
              <Text style={styles.setupButtonText}>Set up now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.sections}>
            <View style={styles.overviewGrid}>
              {summaryCards.map((card) => (
                <View key={card.key} style={[styles.overviewCard, { backgroundColor: card.bg }]}>
                  <Text style={styles.overviewTitle}>{card.title}</Text>
                  <Text style={[styles.overviewValue, { color: card.valueColor }]} numberOfLines={2}>
                    {card.value}
                  </Text>
                  <Text style={styles.overviewSub}>
                    {card.key === 'variance'
                      ? `${inr.format(Math.abs(report?.overview?.variance ?? 0))} ${report?.overview?.varianceLabel ?? ''}`
                      : card.subtitle}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Estimated vs Actual Spending</Text>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSquare, { backgroundColor: '#D85A30' }]} />
                  <Text style={styles.legendText}>Estimated</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSquare, { backgroundColor: '#3B82F6' }]} />
                  <Text style={styles.legendText}>Actual</Text>
                </View>
              </View>
              <View style={{ marginTop: 8, gap: 10 }}>
                {chartRows.map((row) => {
                  const estimatedWidth = Math.max(4, (row.estimated / Math.max(1, report.overview?.totalContractAmount ?? 1)) * maxBarWidth)
                  const actualWidth = Math.max(4, (row.actual / Math.max(1, report.overview?.totalContractAmount ?? 1)) * maxBarWidth)
                  return (
                    <View key={row.label}>
                      <Text style={styles.chartLabel} numberOfLines={1}>{row.label}</Text>
                      <View style={styles.chartBarsWrap}>
                        <View style={[styles.chartBar, { width: estimatedWidth, backgroundColor: '#D85A30' }]} />
                        <View style={[styles.chartBar, { width: actualWidth, backgroundColor: '#3B82F6', marginTop: 4 }]} />
                        <Text style={styles.chartAmount}>
                          {inr.format(row.estimated)} / {inr.format(row.actual)}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Stage-wise Payment Tracker</Text>
              <View style={{ marginTop: 8, gap: 8 }}>
                {(report.stagePayments ?? []).map((row) => {
                  const pill = statusPill(row.status)
                  return (
                    <View key={row.stage} style={styles.stageItem}>
                      <View style={[styles.stageDot, { backgroundColor: pill.border }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stageLabel}>{row.label}</Text>
                        <Text style={styles.stageExpected}>Expected {inr.format(row.expectedAmount)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={styles.stageActual}>{inr.format(row.actualPaidAmount)}</Text>
                        <View style={[styles.stageBadge, { backgroundColor: pill.bg }]}>
                          <Text style={[styles.stageBadgeText, { color: pill.fg }]}>{row.status}</Text>
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>

            {categoryRows.length ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Spending by category</Text>
                <View style={{ marginTop: 8, gap: 8 }}>
                  {categoryRows.map((row) => (
                    <View key={row.name} style={styles.categoryItem}>
                      <Text style={styles.categoryName}>{row.name}</Text>
                      <Text style={styles.categoryValue}>
                        Budgeted: {inr.format(row.budgeted)}
                      </Text>
                      <Text style={styles.categoryValue}>
                        Actual: {inr.format(row.actual)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {(report.escalationAlerts ?? []).length ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Material Price Alerts</Text>
                <View style={{ marginTop: 8, gap: 8 }}>
                  {(report.escalationAlerts ?? []).map((alert) => (
                    <View
                      key={alert.material}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: alert.isAboveThreshold ? '#FECACA' : '#A7F3D0',
                        backgroundColor: alert.isAboveThreshold ? '#FEF2F2' : '#ECFDF5',
                        padding: 12,
                      }}
                    >
                      <Text style={styles.alertTitle}>
                        {alert.isAboveThreshold ? '⚠️' : '✅'} {alert.material}
                      </Text>
                      <Text style={styles.alertText}>
                        Agreed rate: {inr.format(alert.agreedRate)} | Current: {inr.format(alert.currentRate)} | +{alert.increasePercent.toFixed(1)}%
                      </Text>
                      {alert.isAboveThreshold ? (
                        <Text style={styles.alertExtra}>
                          Extra cost estimate: {inr.format(alert.estimatedExtraCost)}
                        </Text>
                      ) : (
                        <Text style={styles.alertText}>Within agreed rates</Text>
                      )}
                    </View>
                  ))}
                </View>
                <View style={styles.inlineInputs}>
                  <TextInput
                    value={cementRate}
                    onChangeText={setCementRate}
                    keyboardType="numeric"
                    placeholder="Cement ₹/bag"
                    style={styles.inlineInput}
                  />
                  <TextInput
                    value={steelRate}
                    onChangeText={setSteelRate}
                    keyboardType="numeric"
                    placeholder="Steel ₹/kg"
                    style={styles.inlineInput}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => void submitRates()}
                  disabled={updatingPrices}
                  style={[styles.primaryAction, updatingPrices && styles.primaryActionDisabled]}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                    {updatingPrices ? 'Saving...' : 'Update material prices'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {report.timeline ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Project Timeline</Text>
                <View style={styles.timelineBar}>
                  <View
                    style={{
                      height: 8,
                      width: `${Math.max(0, Math.min(100, report.timeline.progressPercent))}%`,
                      backgroundColor: '#D85A30',
                    }}
                  />
                  <View
                    style={{
                      position: 'absolute',
                      left: `${Math.max(0, Math.min(100, report.timeline.progressPercent))}%`,
                      marginLeft: -5,
                      top: -1,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: '#D85A30',
                      borderWidth: 1,
                      borderColor: '#FFFFFF',
                    }}
                  />
                </View>
                <View style={styles.timelineDates}>
                  <Text style={styles.timelineDate}>{report.timeline.startDate}</Text>
                  <Text style={styles.timelineDate}>{report.timeline.expectedEndDate}</Text>
                </View>
                <Text style={styles.timelineMeta}>
                  Current stage: {report.timeline.currentStage} • {report.timeline.monthsElapsed}/{report.timeline.totalMonths} months
                </Text>
                <Text style={[styles.timelineStatus, { color: report.timeline.isDelayed ? '#B45309' : '#166534' }]}>
                  {report.timeline.isDelayed ? 'Estimated delay risk' : 'On track'}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => void openPdfOnWeb()}
              style={styles.primaryAction}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Download PDF (Open Web)</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <FinancialSetupSheet
        visible={showSetupSheet}
        projectId={projectId}
        onClose={() => setShowSetupSheet(false)}
        onSuccess={() => void load({ silent: true })}
      />
    </View>
    </KeyboardSafeView>
  )
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 120 },
  sections: { gap: 12 },
  emptyCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { marginTop: 8, fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptyText: { marginTop: 8, fontSize: 13, color: '#4B5563', textAlign: 'center', lineHeight: 20 },
  emptyTextMuted: { marginTop: 8, fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  setupButton: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D85A30',
  },
  setupButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  overviewCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
  },
  overviewTitle: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  overviewValue: { marginTop: 4, fontSize: 16, fontWeight: '700' },
  overviewSub: { marginTop: 3, fontSize: 11, color: '#6B7280' },
  sectionCard: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
  },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: '#111827' },
  legendRow: { marginTop: 8, flexDirection: 'row', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSquare: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11, color: '#6B7280' },
  chartLabel: { fontSize: 12, color: '#374151', marginBottom: 4, fontWeight: '600' },
  chartBarsWrap: { marginLeft: 6 },
  chartBar: { height: 7, borderRadius: 999 },
  chartAmount: { marginTop: 4, fontSize: 10, color: '#6B7280' },
  stageItem: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: '#F2EDE8', padding: 8 },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  stageLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  stageExpected: { marginTop: 2, fontSize: 12, color: '#6B7280' },
  stageActual: { fontSize: 13, color: '#111827', fontWeight: '600' },
  stageBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  stageBadgeText: { fontSize: 10, fontWeight: '700' },
  categoryItem: { borderRadius: 10, borderWidth: 1, borderColor: '#F2EDE8', padding: 8 },
  categoryName: { fontSize: 12, fontWeight: '600', color: '#374151' },
  categoryValue: { marginTop: 2, fontSize: 11, color: '#6B7280' },
  alertTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  alertText: { marginTop: 4, fontSize: 11, color: '#374151' },
  alertExtra: { marginTop: 4, fontSize: 11, fontWeight: '600', color: '#991B1B' },
  inlineInputs: { marginTop: 10, flexDirection: 'row', gap: 8 },
  inlineInput: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    fontSize: 12,
  },
  primaryAction: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#D85A30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionDisabled: { backgroundColor: '#D1D5DB' },
  timelineBar: { marginTop: 10, height: 8, borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  timelineDates: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-between' },
  timelineDate: { fontSize: 10, color: '#6B7280' },
  timelineMeta: { marginTop: 7, fontSize: 12, color: '#374151' },
  timelineStatus: { marginTop: 4, fontSize: 12, fontWeight: '600' },
})
