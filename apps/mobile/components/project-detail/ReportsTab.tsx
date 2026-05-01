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
import Svg, { Rect, Text as SvgText, Line, G } from 'react-native-svg'
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

type BarChartRow = {
  label: string
  estimated: number
  actual: number
}

type TooltipState = {
  x: number
  y: number
  label: string
  value: number
  color: string
  type: 'estimated' | 'actual'
} | null

function SpendingBarChart({ rows }: { rows: BarChartRow[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const BAR_WIDTH = 18
  const BAR_GAP = 6
  const GROUP_GAP = 24
  const GROUP_WIDTH = BAR_WIDTH * 2 + BAR_GAP + GROUP_GAP
  const CHART_HEIGHT = 220
  const Y_AXIS_WIDTH = 52
  const TOP_PADDING = 20
  const BOTTOM_PADDING = 64
  const PLOT_HEIGHT = CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING

  const maxValue = Math.max(
    10000,
    ...rows.map((r) => Math.max(r.estimated, r.actual))
  )
  const yMax = Math.ceil(maxValue / 10000) * 10000
  const yTicks: number[] = []
  for (let v = 0; v <= yMax; v += 10000) {
    yTicks.push(v)
  }

  const totalWidth = Y_AXIS_WIDTH + rows.length * GROUP_WIDTH + 16
  const svgWidth = Math.max(totalWidth, 300)

  function barHeight(value: number): number {
    return (value / yMax) * PLOT_HEIGHT
  }

  function yPos(value: number): number {
    return TOP_PADDING + PLOT_HEIGHT - barHeight(value)
  }

  function groupX(index: number): number {
    return Y_AXIS_WIDTH + index * GROUP_WIDTH + 8
  }

  const formatY = (v: number): string => {
    if (v === 0) return '0'
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
    if (v >= 10000) return `₹${(v / 10000).toFixed(0)}T`
    return `₹${v}`
  }

  const handleBarPress = (
    x: number,
    label: string,
    value: number,
    color: string,
    type: 'estimated' | 'actual'
  ) => {
    if (tooltip && tooltip.label === label && tooltip.type === type) {
      setTooltip(null)
      return
    }
    setTooltip({ x, y: yPos(value) - 36, label, value, color, type })
  }

  const xAxisLabelLines = (label: string): [string, string] => {
    const words = label.trim().split(/\s+/).filter(Boolean)
    if (words.length <= 1) {
      if (label.length <= 12) return [label, '']
      return [`${label.slice(0, 11)}…`, '']
    }
    const first = words.slice(0, 2).join(' ')
    const remaining = words.slice(2).join(' ')
    const second = remaining.length > 14 ? `${remaining.slice(0, 13)}…` : remaining
    const firstLine = first.length > 14 ? `${first.slice(0, 13)}…` : first
    return [firstLine, second]
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 12, height: 12, backgroundColor: '#D85A30', borderRadius: 3 }} />
          <Text style={{ fontSize: 11, color: '#78716C' }}>Estimated</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 12, height: 12, backgroundColor: '#3B82F6', borderRadius: 3 }} />
          <Text style={{ fontSize: 11, color: '#78716C' }}>Actual</Text>
        </View>
        <Text style={{ fontSize: 10, color: '#A8A29E', marginLeft: 'auto', fontStyle: 'italic' }}>
          Tap bars to see value
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        style={{ marginHorizontal: -4 }}
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        <Svg width={svgWidth} height={CHART_HEIGHT}>
          {yTicks.map((tick) => {
            const y = yPos(tick)
            return (
              <G key={tick}>
                <Line
                  x1={Y_AXIS_WIDTH}
                  y1={y}
                  x2={svgWidth - 8}
                  y2={y}
                  stroke="#F2EDE8"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : '3 3'}
                />
                <SvgText x={Y_AXIS_WIDTH - 4} y={y + 4} fontSize={9} fill="#A8A29E" textAnchor="end">
                  {formatY(tick)}
                </SvgText>
              </G>
            )
          })}

          <Line
            x1={Y_AXIS_WIDTH}
            y1={TOP_PADDING + PLOT_HEIGHT}
            x2={svgWidth - 8}
            y2={TOP_PADDING + PLOT_HEIGHT}
            stroke="#E8DDD4"
            strokeWidth={1}
          />

          {rows.map((row, index) => {
            const gx = groupX(index)
            const estH = barHeight(row.estimated)
            const actH = barHeight(row.actual)
            const estX = gx
            const actX = gx + BAR_WIDTH + BAR_GAP
            const baseY = TOP_PADDING + PLOT_HEIGHT
            const [xLabel1, xLabel2] = xAxisLabelLines(row.label)

            return (
              <G key={row.label}>
                <Rect
                  x={estX}
                  y={baseY - estH}
                  width={BAR_WIDTH}
                  height={Math.max(estH, 2)}
                  rx={4}
                  fill="#D85A30"
                  opacity={tooltip && tooltip.label === row.label ? (tooltip.type === 'estimated' ? 1 : 0.4) : 1}
                  onPress={() =>
                    handleBarPress(
                      estX + BAR_WIDTH / 2,
                      row.label,
                      row.estimated,
                      '#D85A30',
                      'estimated'
                    )
                  }
                />

                <Rect
                  x={actX}
                  y={baseY - actH}
                  width={BAR_WIDTH}
                  height={Math.max(actH, 2)}
                  rx={4}
                  fill="#3B82F6"
                  opacity={tooltip && tooltip.label === row.label ? (tooltip.type === 'actual' ? 1 : 0.4) : 1}
                  onPress={() =>
                    handleBarPress(
                      actX + BAR_WIDTH / 2,
                      row.label,
                      row.actual,
                      '#3B82F6',
                      'actual'
                    )
                  }
                />

                <SvgText x={gx + BAR_WIDTH + BAR_GAP / 2} y={baseY + 14} fontSize={8} fill="#78716C" textAnchor="middle">
                  {xLabel1}
                </SvgText>
                {xLabel2 ? (
                  <SvgText x={gx + BAR_WIDTH + BAR_GAP / 2} y={baseY + 24} fontSize={8} fill="#78716C" textAnchor="middle">
                    {xLabel2}
                  </SvgText>
                ) : null}
              </G>
            )
          })}

          {tooltip ? (() => {
            const tooltipW = 100
            const tooltipH = 44
            const txRaw = tooltip.x - tooltipW / 2
            const tx = Math.max(Y_AXIS_WIDTH, Math.min(txRaw, svgWidth - tooltipW - 8))
            const ty = Math.max(TOP_PADDING - 10, tooltip.y - tooltipH - 4)

            return (
              <G>
                <Rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={8} fill="#2C2C2A" opacity={0.95} />
                <SvgText
                  x={tx + tooltipW / 2}
                  y={ty + 14}
                  fontSize={9}
                  fill={tooltip.color}
                  textAnchor="middle"
                  fontWeight="700"
                >
                  {tooltip.type === 'estimated' ? 'Estimated' : 'Actual'}
                </SvgText>
                <SvgText
                  x={tx + tooltipW / 2}
                  y={ty + 30}
                  fontSize={11}
                  fill="#FFFFFF"
                  textAnchor="middle"
                  fontWeight="800"
                >
                  {inr.format(tooltip.value)}
                </SvgText>
                <Rect
                  x={tx + tooltipW / 2 - 4}
                  y={ty + tooltipH - 2}
                  width={8}
                  height={8}
                  fill="#2C2C2A"
                  opacity={0.95}
                  rotation={45}
                  origin={`${tx + tooltipW / 2}, ${ty + tooltipH + 2}`}
                />
              </G>
            )
          })() : null}
        </Svg>
      </ScrollView>

      {tooltip ? (
        <TouchableOpacity
          onPress={() => setTooltip(null)}
          style={{
            alignSelf: 'center',
            marginTop: 6,
            paddingHorizontal: 12,
            paddingVertical: 4,
            backgroundColor: '#F2EDE8',
            borderRadius: 20,
          }}
        >
          <Text style={{ fontSize: 10, color: '#78716C' }}>Tap anywhere to dismiss</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

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
    if (status === 'paid') return { bg: '#DCFCE7', fg: '#166534', border: '#22C55E', label: '✓ Paid' }
    if (status === 'partial') return { bg: '#FEF3C7', fg: '#92400E', border: '#F59E0B', label: '⚠️ Partial' }
    if (status === 'due') return { bg: '#FEF3C7', fg: '#92400E', border: '#F59E0B', label: '⏳ Due' }
    return { bg: '#F2EDE8', fg: '#A8A29E', border: '#A8A29E', label: '🔒 Upcoming' }
  }

  const summaryCards = [
    {
      key: 'contract',
      emoji: '📋',
      title: 'Total Contract',
      value: inr.format(report?.overview?.totalContractAmount ?? 0),
      subtitle: 'Contract value',
      bg: '#F2EDE8',
      valueColor: '#2C2C2A',
    },
    {
      key: 'estimated',
      emoji: '📐',
      title: 'Estimated Spent',
      value: inr.format(report?.overview?.totalEstimatedSoFar ?? 0),
      subtitle: 'Expected so far',
      bg: '#EFF6FF',
      valueColor: '#1D4ED8',
    },
    {
      key: 'actual',
      emoji: '💸',
      title: 'Actual Spent',
      value: inr.format(report?.overview?.totalActualSpent ?? 0),
      subtitle: 'Actually paid',
      bg: '#FBF0EB',
      valueColor: '#D85A30',
    },
    {
      key: 'variance',
      emoji: (report?.overview?.variance ?? 0) >= 0 ? '✅' : '⚠️',
      title: 'Variance',
      value: inr.format(Math.abs(report?.overview?.variance ?? 0)),
      subtitle: (report?.overview?.variance ?? 0) >= 0 ? 'Under budget' : 'Over budget',
      bg: (report?.overview?.variance ?? 0) >= 0 ? '#ECFDF5' : '#FEF2F2',
      valueColor: (report?.overview?.variance ?? 0) >= 0 ? '#166534' : '#B91C1C',
    },
  ]

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
                  <Text style={{ fontSize: 20, marginBottom: 6 }}>{card.emoji}</Text>
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
              <SpendingBarChart
                rows={chartRows.map((row) => ({
                  label: row.label,
                  estimated: row.estimated,
                  actual: row.actual,
                }))}
              />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Stage-wise Payment Tracker</Text>
              <Text style={styles.stageHeaderTitle}>📊 Stage Payments</Text>
              <View style={{ marginTop: 8, gap: 8 }}>
                {(report.stagePayments ?? []).map((row) => {
                  const pill = statusPill(row.status)
                  return (
                    <View key={row.stage} style={styles.stageItem}>
                      <View style={[styles.stageDot, { backgroundColor: pill.border }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stageLabel}>{row.label}</Text>
                        <Text style={styles.stageExpected}>{`${Math.round((row.expectedAmount / Math.max(report?.overview?.totalContractAmount ?? 1, 1)) * 100)}% · ${inr.format(row.expectedAmount)}`}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={styles.stageActual}>{inr.format(row.actualPaidAmount)}</Text>
                        <View style={[styles.stageBadge, { backgroundColor: pill.bg }]}>
                          <Text style={[styles.stageBadgeText, { color: pill.fg }]}>{pill.label}</Text>
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
  container: { padding: 16, paddingBottom: 120, backgroundColor: '#F2EDE8' },
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
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#E8DDD4',
    padding: 12,
  },
  overviewTitle: { fontSize: 10, color: '#78716C', fontWeight: '600' },
  overviewValue: { marginTop: 0, fontSize: 18, fontWeight: '800' },
  overviewSub: { marginTop: 3, fontSize: 10, color: '#78716C' },
  sectionCard: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#E8DDD4',
    padding: 12,
  },
  sectionHeading: { fontSize: 11, fontWeight: '700', color: '#2C2C2A', marginBottom: 6 },
  stageHeaderTitle: { fontSize: 11, fontWeight: '700', color: '#2C2C2A', marginBottom: 2 },
  stageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 0.5,
    borderColor: '#F2EDE8',
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  stageDot: { width: 8, height: 8, borderRadius: 4 },
  stageLabel: { fontSize: 11, fontWeight: '600', color: '#2C2C2A' },
  stageExpected: { marginTop: 2, fontSize: 9, color: '#A8A29E' },
  stageActual: { fontSize: 11, color: '#2C2C2A', fontWeight: '700' },
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
