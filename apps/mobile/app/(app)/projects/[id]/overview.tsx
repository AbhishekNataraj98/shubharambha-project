import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, {
  Path, Circle, Line, Rect,
  Text as SvgText, G, Defs,
  LinearGradient, Stop, Polyline,
} from 'react-native-svg'
import { useSessionState } from '@/lib/auth-state'
import { apiGet, apiPost } from '@/lib/api'

type StageRow = {
  stageKey: string
  floorIndex: number
  stageLabel: string
  estimate: number
  low: number
  high: number
  sr: number
  actual: number
}

type OverviewPayload = {
  rows?: Array<{ stageKey: string; floorIndex: number; stageLabel: string; actualCost: number }>
}

const BRAND = '#D85A30'
const BRAND_DARK = '#B8471F'
const BRAND_LIGHT = '#FBF0EB'
const BRAND_BORDER = '#F5DDD4'
const CHARCOAL = '#2C2C2A'
const PAGE_BG = '#F2EDE8'
const CARD_BG = '#FFFFFF'
const CARD_BORDER = '#E8DDD4'
const MUTED = '#78716C'
const MUTED_LIGHT = '#A8A29E'
const BLUE = '#3B82F6'
const GREEN = '#10B981'
const RED = '#DC2626'

const PRE_STAGES = [
  { key: 'earthwork', label: 'Earthwork & excavation', weight: 4 },
  { key: 'footing', label: 'Footing', weight: 6 },
  { key: 'foundation', label: 'Foundation', weight: 7 },
  { key: 'plinth', label: 'Plinth beam', weight: 4 },
  { key: 'backfilling', label: 'Backfilling', weight: 3 },
] as const

const FLOOR_LOOP = [
  { key: 'brickwork', label: 'Brickwork', weight: 7 },
  { key: 'lintels', label: 'Lintels', weight: 3 },
  { key: 'doors_windows', label: 'Doors & windows', weight: 5 },
  { key: 'rcc_slab_beam', label: 'RCC slab + beam', weight: 8 },
] as const

const POST_STAGES = [
  { key: 'tile_laying', label: 'Tile laying (flooring)', weight: 7 },
  { key: 'electrical', label: 'Electrical works', weight: 6 },
  { key: 'plumbing', label: 'Plumbing', weight: 5 },
  { key: 'plastering', label: 'Plastering', weight: 6 },
  { key: 'paint', label: 'Painting', weight: 5 },
  { key: 'compound', label: 'Compound wall work', weight: 4 },
  { key: 'wood_polish', label: 'Wood polish', weight: 3 },
  { key: 'final_fittings', label: 'Final fittings', weight: 4 },
  { key: 'gate_railings', label: 'Gate & railings', weight: 3 },
] as const

const TIER_BANDS = {
  low: { label: 'Low', min: 1800, max: 2200, reference: 2000 },
  medium: { label: 'Medium', min: 2200, max: 2800, reference: 2500 },
  high: { label: 'High', min: 3000, max: 4500, reference: 3600 },
} as const

type TierKey = keyof typeof TIER_BANDS

const MATERIAL_INPUTS = [
  { key: 'cement', qtyPerSqft: 0.36, low: 360, mid: 395, high: 430 },
  { key: 'steel', qtyPerSqft: 4.1, low: 48, mid: 52, high: 56 },
  { key: 'brick', qtyPerSqft: 7.5, low: 5, mid: 6.5, high: 8 },
  { key: 'sandAgg', qtyPerSqft: 0.06, low: 6500, mid: 7600, high: 9000 },
  { key: 'labour', qtyPerSqft: 1, low: 320, mid: 420, high: 560 },
  { key: 'finishing', qtyPerSqft: 1, low: 420, mid: 640, high: 980 },
] as const

const SR_ITEMS = [
  { item: 'Earthwork excavation', srRate: 280, qtyPer1000Sqft: 45 },
  { item: 'RCC footing + pedestals', srRate: 8200, qtyPer1000Sqft: 15 },
  { item: 'RCC slabs & beams', srRate: 8800, qtyPer1000Sqft: 18 },
  { item: 'Brickwork 230mm', srRate: 5200, qtyPer1000Sqft: 55 },
  { item: 'TMT steel Fe-500', srRate: 72000, qtyPer1000Sqft: 4.2 },
  { item: 'Plastering int/ext', srRate: 202, qtyPer1000Sqft: 560 },
  { item: 'Electrical points', srRate: 1800, qtyPer1000Sqft: 55 },
] as const

const ROOM_PRESETS = [
  { name: 'Living Room', length: 14, width: 12, factor: 1 },
  { name: 'Master Bedroom', length: 13, width: 11, factor: 1.05 },
  { name: 'Bedroom 2', length: 12, width: 10, factor: 0.98 },
  { name: 'Kitchen', length: 10, width: 9, factor: 1.15 },
  { name: 'Bathrooms (2)', length: 13, width: 5, factor: 1.22 },
] as const

function formatINR(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function cumulativeSeries(values: number[]) {
  const output: number[] = []
  let running = 0
  for (const value of values) {
    running += value
    output.push(running)
  }
  return output
}

function getMaterialTotals(areaSqft: number) {
  return MATERIAL_INPUTS.reduce(
    (acc, item) => {
      const qty = item.qtyPerSqft * areaSqft
      acc.low += qty * item.low
      acc.mid += qty * item.mid
      acc.high += qty * item.high
      return acc
    },
    { low: 0, mid: 0, high: 0 }
  )
}

function getSrTotal(areaSqft: number, overheadPct: number, gstPct: number) {
  const base = SR_ITEMS.reduce((sum, item) => sum + item.srRate * item.qtyPer1000Sqft * (areaSqft / 1000), 0)
  return base * (1 + overheadPct / 100 + gstPct / 100)
}

function buildPlan(
  areaSqft: number,
  costPerSqft: number,
  floors: number,
  tier: TierKey,
  srOverheadPct: number,
  srGstPct: number
) {
  const list: Array<{ stageKey: string; floorIndex: number; stageLabel: string; weight: number }> = []
  PRE_STAGES.forEach((stage) => list.push({ stageKey: stage.key, floorIndex: 0, stageLabel: stage.label, weight: stage.weight }))
  for (let f = 1; f <= floors; f += 1) {
    FLOOR_LOOP.forEach((stage) =>
      list.push({
        stageKey: `${stage.key}_f${f}`,
        floorIndex: f,
        stageLabel: `${stage.label}${floors > 1 ? ` (F${f})` : ''}`,
        weight: stage.weight,
      })
    )
  }
  POST_STAGES.forEach((stage) => list.push({ stageKey: stage.key, floorIndex: floors, stageLabel: stage.label, weight: stage.weight }))

  const totalBudget = areaSqft * costPerSqft
  const materialTotals = getMaterialTotals(areaSqft)
  const tierBand = TIER_BANDS[tier]
  const lowTotal = Math.max(materialTotals.low, areaSqft * tierBand.min)
  const highTotal = Math.max(materialTotals.high, areaSqft * tierBand.max)
  const srTotal = getSrTotal(areaSqft, srOverheadPct, srGstPct)
  const totalWeight = list.reduce((sum, stage) => sum + stage.weight, 0)
  return {
    totalBudget,
    lowTotal,
    highTotal,
    srTotal,
    materialTotals,
    rows: list.map((stage) => ({
      stageKey: stage.stageKey,
      floorIndex: stage.floorIndex,
      stageLabel: stage.stageLabel,
      estimate: totalWeight > 0 ? (totalBudget * stage.weight) / totalWeight : 0,
      low: totalWeight > 0 ? (lowTotal * stage.weight) / totalWeight : 0,
      high: totalWeight > 0 ? (highTotal * stage.weight) / totalWeight : 0,
      sr: totalWeight > 0 ? (srTotal * stage.weight) / totalWeight : 0,
      actual: 0,
    })),
  }
}

type SvgAreaChartProps = {
  values: number[]
  color: string
  fillColor: string
  labels: string[]
  height?: number
  showDots?: boolean
}

function SvgAreaChart({
  values,
  color,
  fillColor,
  labels,
  height = 120,
  showDots = true,
}: SvgAreaChartProps) {
  const [containerWidth, setContainerWidth] = useState(300)
  const PAD_L = 38
  const PAD_R = 12
  const PAD_T = 14
  const PAD_B = 28
  const plotW = containerWidth - PAD_L - PAD_R
  const plotH = height - PAD_T - PAD_B
  const n = values.length
  const maxVal = Math.max(1, ...values)

  const yTicks = [0, 0.33, 0.66, 1].map((t) => Math.round(t * maxVal))

  const getX = (i: number) =>
    PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const getY = (v: number) =>
    PAD_T + plotH - (v / maxVal) * plotH

  const pts = values
    .map((v, i) => `${getX(i)},${getY(v)}`)
    .join(' ')

  const areaPath =
    n === 0
      ? ''
      : `M${getX(0)},${PAD_T + plotH} ` +
        values.map((v, i) => `L${getX(i)},${getY(v)}`).join(' ') +
        ` L${getX(n - 1)},${PAD_T + plotH} Z`

  const formatY = (v: number): string => {
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`
    return `₹${v}`
  }

  return (
    <View
      onLayout={(e) =>
        setContainerWidth(e.nativeEvent.layout.width)
      }
      style={{ width: '100%' }}
    >
      <Svg width={containerWidth} height={height}>
        <Defs>
          <LinearGradient id={`grad_${color.replace('#', '')}`}
            x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.25" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {yTicks.map((tick) => {
          const y = getY(tick)
          return (
            <G key={tick}>
              <Line
                x1={PAD_L} y1={y}
                x2={containerWidth - PAD_R} y2={y}
                stroke="#F2EDE8" strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : '3 3'}
              />
              <SvgText
                x={PAD_L - 4} y={y + 4}
                fontSize={8} fill={MUTED_LIGHT}
                textAnchor="end"
              >
                {formatY(tick)}
              </SvgText>
            </G>
          )
        })}

        <Line
          x1={PAD_L} y1={PAD_T + plotH}
          x2={containerWidth - PAD_R} y2={PAD_T + plotH}
          stroke={CARD_BORDER} strokeWidth={1}
        />

        {areaPath ? (
          <Path
            d={areaPath}
            fill={`url(#grad_${color.replace('#', '')})`}
          />
        ) : null}

        {n > 1 ? (
          <Polyline
            points={pts}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {showDots
          ? values.map((v, i) => (
              <Circle
                key={i}
                cx={getX(i)} cy={getY(v)}
                r={3.5} fill={CARD_BG}
                stroke={color} strokeWidth={2}
              />
            ))
          : null}

        {labels.map((lbl, i) => {
          const step = n > 10 ? 3 : n > 6 ? 2 : 1
          if (i % step !== 0 && i !== n - 1) return null
          return (
            <SvgText
              key={i}
              x={getX(i)} y={height - 4}
              fontSize={8} fill={MUTED_LIGHT}
              textAnchor="middle"
            >
              {lbl}
            </SvgText>
          )
        })}
      </Svg>
    </View>
  )
}

type BarPair = { label: string; a: number; b: number }

function SvgDualBarChart({
  pairs,
  colorA = BRAND,
  colorB = BLUE,
  labelA = 'Estimated',
  labelB = 'Actual',
  height = 160,
}: {
  pairs: BarPair[]
  colorA?: string
  colorB?: string
  labelA?: string
  labelB?: string
  height?: number
}) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; value: number; color: string; label: string
  } | null>(null)

  const PAD_L = 42
  const PAD_R = 8
  const PAD_T = 16
  const PAD_B = 32
  const BAR_W = 10
  const BAR_GAP = 3
  const GROUP_GAP = 18
  const GROUP_W = BAR_W * 2 + BAR_GAP + GROUP_GAP
  const plotH = height - PAD_T - PAD_B
  const svgW = PAD_L + pairs.length * GROUP_W + PAD_R + 16

  const maxVal = Math.max(
    1,
    ...pairs.flatMap((p) => [p.a, p.b])
  )
  const yMax =
    maxVal < 10000
      ? Math.ceil(maxVal / 1000) * 1000
      : Math.ceil(maxVal / 10000) * 10000

  const yTicks: number[] = []
  const tickCount = 4
  for (let i = 0; i <= tickCount; i++) {
    yTicks.push(Math.round((i / tickCount) * yMax))
  }

  const baseY = PAD_T + plotH

  function bh(v: number) {
    return Math.max(2, (v / yMax) * plotH)
  }
  function by(v: number) {
    return baseY - bh(v)
  }
  function gx(i: number) {
    return PAD_L + 8 + i * GROUP_W
  }

  const fmt = (v: number) => {
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`
    return `₹${v}`
  }

  return (
    <View>
      <View style={{
        flexDirection: 'row', gap: 14, marginBottom: 10,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colorA }} />
          <Text style={{ fontSize: 10, color: MUTED }}>{labelA}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colorB }} />
          <Text style={{ fontSize: 10, color: MUTED }}>{labelB}</Text>
        </View>
        <Text style={{
          fontSize: 9, color: MUTED_LIGHT,
          marginLeft: 'auto', fontStyle: 'italic',
        }}>
          Tap bars for values
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
      >
        <Svg width={svgW} height={height}>
          {yTicks.map((tick) => {
            const y = by(tick)
            return (
              <G key={tick}>
                <Line
                  x1={PAD_L} y1={y}
                  x2={svgW - PAD_R} y2={y}
                  stroke="#F2EDE8" strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : '3 3'}
                />
                <SvgText
                  x={PAD_L - 4} y={y + 4}
                  fontSize={8} fill={MUTED_LIGHT}
                  textAnchor="end"
                >
                  {fmt(tick)}
                </SvgText>
              </G>
            )
          })}

          <Line
            x1={PAD_L} y1={baseY}
            x2={svgW - PAD_R} y2={baseY}
            stroke={CARD_BORDER} strokeWidth={1}
          />

          {pairs.map((pair, i) => {
            const ax = gx(i)
            const bx = ax + BAR_W + BAR_GAP

            const dimA = tooltip && (
              tooltip.label !== pair.label ||
              tooltip.color !== colorA
            )
            const dimB = tooltip && (
              tooltip.label !== pair.label ||
              tooltip.color !== colorB
            )

            return (
              <G key={pair.label}>
                <Rect
                  x={ax} y={by(pair.a)}
                  width={BAR_W}
                  height={bh(pair.a)}
                  rx={3} fill={colorA}
                  opacity={dimA ? 0.3 : 1}
                  onPress={() => {
                    if (
                      tooltip?.label === pair.label &&
                      tooltip?.color === colorA
                    ) {
                      setTooltip(null)
                    } else {
                      setTooltip({
                        x: ax + BAR_W / 2,
                        y: by(pair.a),
                        value: pair.a,
                        color: colorA,
                        label: pair.label,
                      })
                    }
                  }}
                />

                <Rect
                  x={bx} y={by(pair.b)}
                  width={BAR_W}
                  height={bh(pair.b)}
                  rx={3} fill={colorB}
                  opacity={dimB ? 0.3 : 1}
                  onPress={() => {
                    if (
                      tooltip?.label === pair.label &&
                      tooltip?.color === colorB
                    ) {
                      setTooltip(null)
                    } else {
                      setTooltip({
                        x: bx + BAR_W / 2,
                        y: by(pair.b),
                        value: pair.b,
                        color: colorB,
                        label: pair.label,
                      })
                    }
                  }}
                />

                <SvgText
                  x={ax + BAR_W + BAR_GAP / 2}
                  y={baseY + 14}
                  fontSize={7} fill={MUTED_LIGHT}
                  textAnchor="middle"
                >
                  {pair.label.length > 6
                    ? pair.label.slice(0, 5) + '…'
                    : pair.label}
                </SvgText>
              </G>
            )
          })}

          {tooltip ? (() => {
            const TW = 90
            const TH = 42
            const tx = Math.max(
              PAD_L,
              Math.min(tooltip.x - TW / 2, svgW - TW - PAD_R)
            )
            const ty = Math.max(PAD_T, tooltip.y - TH - 8)
            const inrFmt = new Intl.NumberFormat('en-IN', {
              style: 'currency', currency: 'INR',
              maximumFractionDigits: 0,
            })
            return (
              <G>
                <Rect x={tx} y={ty} width={TW} height={TH}
                  rx={8} fill={CHARCOAL} opacity={0.95} />
                <SvgText
                  x={tx + TW / 2} y={ty + 14}
                  fontSize={8} fill={tooltip.color}
                  textAnchor="middle" fontWeight="700"
                >
                  {tooltip.color === colorA ? labelA : labelB}
                </SvgText>
                <SvgText
                  x={tx + TW / 2} y={ty + 30}
                  fontSize={10} fill="#FFFFFF"
                  textAnchor="middle" fontWeight="800"
                >
                  {inrFmt.format(tooltip.value)}
                </SvgText>
              </G>
            )
          })() : null}
        </Svg>
      </ScrollView>

      {tooltip ? (
        <TouchableOpacity
          onPress={() => setTooltip(null)}
          style={{
            alignSelf: 'center', marginTop: 4,
            paddingHorizontal: 12, paddingVertical: 3,
            backgroundColor: PAGE_BG, borderRadius: 20,
          }}
        >
          <Text style={{ fontSize: 9, color: MUTED }}>
            Tap to dismiss
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function SvgDonutChart({
  segments,
  total,
  size = 120,
}: {
  segments: Array<{ color: string; value: number; label: string }>
  total: number
  size?: number
}) {
  const cx = size / 2
  const cy = size / 2
  const R = size / 2 - 14
  const strokeW = 14
  const circumference = 2 * Math.PI * R

  let offset = 0
  const paths = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0
    const dash = frac * circumference
    const gap = circumference - dash
    const rotate = -90 + (offset / circumference) * 360
    offset += dash
    return { ...seg, dash, gap, rotate }
  })

  const fmt = (v: number) =>
    v >= 100000
      ? `₹${(v / 100000).toFixed(1)}L`
      : `₹${(v / 1000).toFixed(0)}K`

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx} cy={cy} r={R}
          fill="none" stroke={PAGE_BG}
          strokeWidth={strokeW}
        />
        {paths.map((seg, i) => (
          <Circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeW}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            transform={`rotate(${seg.rotate} ${cx} ${cy})`}
          />
        ))}
        <SvgText
          x={cx} y={cy - 6}
          textAnchor="middle"
          fontSize={11} fontWeight="800" fill={CHARCOAL}
        >
          {fmt(total)}
        </SvgText>
        <SvgText
          x={cx} y={cy + 8}
          textAnchor="middle"
          fontSize={8} fill={MUTED}
        >
          budget
        </SvgText>
      </Svg>

      <View style={{ flex: 1, gap: 5 }}>
        {segments.map((seg, i) => (
          <View key={i} style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{
                width: 8, height: 8,
                borderRadius: 2,
                backgroundColor: seg.color,
              }} />
              <Text style={{ fontSize: 9, color: MUTED }}>
                {seg.label}
              </Text>
            </View>
            <Text style={{
              fontSize: 9, fontWeight: '700', color: CHARCOAL,
            }}>
              {fmt(seg.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default function ProjectOverviewScreen() {
  const { id: rawProjectId } = useLocalSearchParams<{ id: string }>()
  const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId
  const { user, profile, loading } = useSessionState()
  const [areaSqft, setAreaSqft] = useState('1800')
  const [costPerSqft, setCostPerSqft] = useState('2000')
  const [floors, setFloors] = useState('2')
  const [tier, setTier] = useState<TierKey>('medium')
  const [srOverheadPct, setSrOverheadPct] = useState('18')
  const [srGstPct, setSrGstPct] = useState('5')
  const [activeTab, setActiveTab] = useState<'market' | 'sr' | 'building' | 'tracking'>('market')
  const [roomInputs, setRoomInputs] = useState(() =>
    ROOM_PRESETS.map((room) => ({ length: String(room.length), width: String(room.width) }))
  )
  const [savedActuals, setSavedActuals] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const numericArea = Math.max(1, Number(areaSqft) || 1)
  const numericCost = Math.max(1, Number(costPerSqft) || 1)
  const numericFloors = Math.max(1, Math.min(10, Number(floors) || 1))
  const numericOverhead = Math.max(0, Number(srOverheadPct) || 0)
  const numericGst = Math.max(0, Number(srGstPct) || 0)

  const { totalBudget, lowTotal, highTotal, srTotal, rows } = useMemo(() => {
    const plan = buildPlan(numericArea, numericCost, numericFloors, tier, numericOverhead, numericGst)
    return {
      totalBudget: plan.totalBudget,
      lowTotal: plan.lowTotal,
      highTotal: plan.highTotal,
      srTotal: plan.srTotal,
      rows: plan.rows.map((row) => ({
        ...row,
        actual: savedActuals[row.stageKey] ?? 0,
      })),
    }
  }, [numericArea, numericCost, numericFloors, tier, numericOverhead, numericGst, savedActuals])

  const estimatedTotal = rows.reduce((sum, row) => sum + row.estimate, 0)
  const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0)
  const variance = actualTotal - estimatedTotal
  const stageCodes = rows.map((_, index) => `S${index + 1}`)

  const loadActuals = useCallback(async () => {
    if (!projectId) return
    try {
      const payload = await apiGet<OverviewPayload>(`/api/projects/${projectId}/overview`)
      const map: Record<string, number> = {}
      for (const row of payload.rows ?? []) map[row.stageKey] = Number(row.actualCost ?? 0)
      setSavedActuals(map)
    } catch (error) {
      Alert.alert('Project overview', error instanceof Error ? error.message : 'Failed to load overview data')
    }
  }, [projectId])

  useEffect(() => {
    void loadActuals()
  }, [loadActuals])

  if (loading) return null
  if (!user) return <Redirect href="/(auth)/login" />
  if (!profile || !projectId) return <Redirect href="/(app)/(tabs)" />

  const onChangeActual = (stageKey: string, value: string) => {
    const num = Number(value.replace(/[^\d]/g, ''))
    setSavedActuals((prev) => ({ ...prev, [stageKey]: Number.isFinite(num) ? num : 0 }))
  }

  const onChangeRoomInput = (index: number, key: 'length' | 'width', value: string) => {
    const cleaned = value.replace(/[^\d]/g, '')
    setRoomInputs((prev) => prev.map((room, idx) => (idx === index ? { ...room, [key]: cleaned } : room)))
  }

  const onSave = async () => {
    setSaving(true)
    try {
      await apiPost(`/api/projects/${projectId}/overview`, {
        rows: rows.map((row) => ({
          stageKey: row.stageKey,
          floorIndex: row.floorIndex,
          stageLabel: row.stageLabel,
          actualCost: row.actual,
        })),
      })
      Alert.alert('Saved', 'Project overview actuals saved successfully.')
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save overview data.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: PAGE_BG }}
      edges={['left', 'right']}
    >
      <ScrollView contentContainerStyle={{
        paddingBottom: 32,
      }}>
        <View style={{
          backgroundColor: CHARCOAL,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 16,
        }}>
          <Text style={{
            fontSize: 20,
            fontWeight: '800',
            color: '#FFFFFF',
          }}>
            Project Overview
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 12 }}
            contentContainerStyle={{ gap: 6, paddingRight: 4 }}
          >
            {[
              ['market', 'Market'],
              ['sr', 'PWD SR'],
              ['building', 'Building'],
              ['tracking', 'Tracker'],
            ].map(([key, label]) => (
              <TouchableOpacity
                key={key}
                onPress={() => setActiveTab(key as typeof activeTab)}
                style={{
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  backgroundColor:
                    activeTab === key
                      ? BRAND
                      : 'rgba(255,255,255,0.12)',
                  borderWidth: 0.5,
                  borderColor:
                    activeTab === key
                      ? BRAND
                      : 'rgba(255,255,255,0.2)',
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: activeTab === key
                    ? '#FFFFFF'
                    : 'rgba(255,255,255,0.7)',
                }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={{ margin: 14, marginBottom: 0 }}>
          <View style={{
            borderRadius: 14,
            borderWidth: 0.5,
            borderColor: BRAND_BORDER,
            backgroundColor: BRAND_LIGHT,
            padding: 12,
          }}>
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: MUTED,
              letterSpacing: 0.06,
              marginBottom: 10,
            }}>
              PROJECT PARAMETERS
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SelectMetric
                label="Tier"
                value={tier}
                onChange={(value) => {
                  const next = value as TierKey
                  setTier(next)
                  setCostPerSqft(String(TIER_BANDS[next].reference))
                }}
                options={[
                  { label: 'Low', value: 'low' },
                  { label: 'Medium', value: 'medium' },
                  { label: 'High', value: 'high' },
                ]}
              />
              <MetricInput
                label="SR overhead %"
                value={srOverheadPct}
                onChange={setSrOverheadPct}
              />
              <MetricInput
                label="SR GST %"
                value={srGstPct}
                onChange={setSrGstPct}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <MetricInput
                label="Cost / sqft"
                value={costPerSqft}
                onChange={setCostPerSqft}
              />
              <MetricInput
                label="Area (sqft)"
                value={areaSqft}
                onChange={setAreaSqft}
              />
              <MetricInput
                label="Floors"
                value={floors}
                onChange={setFloors}
              />
            </View>
          </View>
        </View>

        <View style={{
          flexDirection: 'row', gap: 8,
          margin: 14, marginBottom: 0,
        }}>
          <KpiCard
            title="Est. Budget"
            value={formatINR(totalBudget)}
            tint="#EFF6FF" border="#BFDBFE" text="#1E3A8A"
          />
          <KpiCard
            title="Actual Spent"
            value={formatINR(actualTotal)}
            tint={BRAND_LIGHT} border={BRAND_BORDER}
            text={BRAND_DARK}
          />
          <KpiCard
            title="Variance"
            value={`${variance >= 0 ? '+' : ''}${formatINR(variance)}`}
            tint={variance > 0 ? '#FEF2F2'
              : variance < 0 ? '#ECFDF5' : '#F2EDE8'}
            border={variance > 0 ? '#FECACA'
              : variance < 0 ? '#BBF7D0' : CARD_BORDER}
            text={variance > 0 ? RED
              : variance < 0 ? '#166534' : MUTED}
          />
        </View>

        {activeTab === 'market' ? (
          <View style={{ margin: 14, gap: 12 }}>
            <View style={{
              backgroundColor: CARD_BG,
              borderRadius: 14,
              borderWidth: 0.5,
              borderColor: CARD_BORDER,
              padding: 14,
            }}>
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: CHARCOAL, marginBottom: 14,
              }}>
                Budget Breakdown
              </Text>
              <SvgDonutChart
                total={totalBudget}
                segments={[
                  {
                    color: BRAND,
                    value: totalBudget * 0.35,
                    label: 'Structure (35%)',
                  },
                  {
                    color: '#F59E0B',
                    value: totalBudget * 0.20,
                    label: 'Masonry (20%)',
                  },
                  {
                    color: BLUE,
                    value: totalBudget * 0.25,
                    label: 'Finishing (25%)',
                  },
                  {
                    color: GREEN,
                    value: totalBudget * 0.20,
                    label: 'Others (20%)',
                  },
                ]}
              />
            </View>

            <View style={{
              backgroundColor: CARD_BG,
              borderRadius: 14,
              borderWidth: 0.5,
              borderColor: CARD_BORDER,
              padding: 14,
            }}>
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}>
                <Text style={{
                  fontSize: 12, fontWeight: '700',
                  color: CHARCOAL,
                }}>
                  Cost Projection Timeline
                </Text>
                <Text style={{
                  fontSize: 9, color: MUTED_LIGHT,
                  fontStyle: 'italic',
                }}>
                  Cumulative
                </Text>
              </View>
              <SvgAreaChart
                values={cumulativeSeries(
                  rows.map((r) => r.estimate)
                )}
                labels={stageCodes}
                color={BRAND}
                fillColor={BRAND_LIGHT}
                height={140}
              />
              <View style={{
                marginTop: 8,
                backgroundColor: PAGE_BG,
                borderRadius: 8,
                padding: 8,
              }}>
                <Text style={{
                  fontSize: 10, color: MUTED,
                  textAlign: 'center',
                }}>
                  Range band: {formatINR(lowTotal)} — {formatINR(highTotal)}
                </Text>
              </View>
            </View>

            <View style={{
              backgroundColor: CARD_BG,
              borderRadius: 14,
              borderWidth: 0.5,
              borderColor: CARD_BORDER,
              padding: 14,
            }}>
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: CHARCOAL, marginBottom: 2,
              }}>
                Estimated vs Actual per Stage
              </Text>
              <SvgDualBarChart
                pairs={rows.map((r, i) => ({
                  label: stageCodes[i] ?? `S${i + 1}`,
                  a: r.estimate,
                  b: r.actual,
                }))}
                colorA={BRAND}
                colorB={BLUE}
                labelA="Estimated"
                labelB="Actual"
                height={170}
              />
            </View>
          </View>
        ) : null}

        {activeTab === 'sr' ? (
          <View style={{ margin: 14, gap: 12 }}>
            <View style={{
              backgroundColor: CHARCOAL,
              borderRadius: 14,
              padding: 14,
            }}>
              <Text style={{
                fontSize: 10, color: 'rgba(255,255,255,0.4)',
                letterSpacing: 0.06, marginBottom: 10,
              }}>
                MARKET vs PWD SR
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{
                  flex: 1,
                  backgroundColor: 'rgba(216,90,48,0.2)',
                  borderRadius: 10, padding: 10,
                  alignItems: 'center',
                }}>
                  <Text style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.5)',
                  }}>
                    Market rate
                  </Text>
                  <Text style={{
                    fontSize: 18, fontWeight: '800',
                    color: BRAND, marginTop: 2,
                  }}>
                    {formatINR(totalBudget)}
                  </Text>
                  <Text style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.4)',
                    marginTop: 2,
                  }}>
                    {formatINR(numericCost)}/sqft
                  </Text>
                </View>
                <View style={{
                  flex: 1,
                  backgroundColor: 'rgba(59,130,246,0.2)',
                  borderRadius: 10, padding: 10,
                  alignItems: 'center',
                }}>
                  <Text style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.5)',
                  }}>
                    PWD SR
                  </Text>
                  <Text style={{
                    fontSize: 18, fontWeight: '800',
                    color: '#93C5FD', marginTop: 2,
                  }}>
                    {formatINR(srTotal)}
                  </Text>
                  <Text style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.4)',
                    marginTop: 2,
                  }}>
                    {formatINR(srTotal / numericArea)}/sqft
                  </Text>
                </View>
              </View>
              <View style={{
                marginTop: 10,
                backgroundColor: 'rgba(16,185,129,0.15)',
                borderRadius: 8, padding: 8,
                alignItems: 'center',
              }}>
                <Text style={{
                  fontSize: 11, fontWeight: '700',
                  color: '#10B981',
                }}>
                  Premium over SR: {formatINR(totalBudget - srTotal)}
                </Text>
              </View>
            </View>

            <View style={{
              backgroundColor: CARD_BG,
              borderRadius: 14,
              borderWidth: 0.5,
              borderColor: CARD_BORDER,
              padding: 14,
            }}>
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: CHARCOAL, marginBottom: 12,
              }}>
                PWD SR Breakdown
              </Text>
              {SR_ITEMS.map((item) => {
                const itemTotal =
                  item.srRate *
                  item.qtyPer1000Sqft *
                  (numericArea / 1000)
                const maxSrTotal = SR_ITEMS.reduce(
                  (m, si) =>
                    Math.max(
                      m,
                      si.srRate *
                        si.qtyPer1000Sqft *
                        (numericArea / 1000)
                    ),
                  1
                )
                const pct = itemTotal / maxSrTotal
                return (
                  <View key={item.item} style={{
                    marginBottom: 10,
                  }}>
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}>
                      <Text style={{
                        fontSize: 11, fontWeight: '600',
                        color: CHARCOAL, flex: 1,
                      }} numberOfLines={1}>
                        {item.item}
                      </Text>
                      <Text style={{
                        fontSize: 11, fontWeight: '700',
                        color: BRAND,
                      }}>
                        {formatINR(itemTotal)}
                      </Text>
                    </View>
                    <View style={{
                      height: 6,
                      backgroundColor: PAGE_BG,
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}>
                      <View style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: BRAND,
                        width: `${pct * 100}%`,
                      }} />
                    </View>
                    <Text style={{
                      fontSize: 9, color: MUTED_LIGHT,
                      marginTop: 2,
                    }}>
                      SR {formatINR(item.srRate)} ·
                      Qty {item.qtyPer1000Sqft}/1000sqft
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        ) : null}

        {activeTab === 'building' ? (
          <View style={{ margin: 14, gap: 10 }}>
            {ROOM_PRESETS.map((room, index) => {
              const length = Math.max(
                1,
                Number(roomInputs[index]?.length) || room.length
              )
              const width = Math.max(
                1,
                Number(roomInputs[index]?.width) || room.width
              )
              const area = length * width
              const marketCost =
                area * numericFloors * numericCost * room.factor
              const srCost =
                area *
                numericFloors *
                (srTotal / numericArea) *
                room.factor
              const saving = marketCost - srCost

              return (
                <View key={room.name} style={{
                  backgroundColor: CARD_BG,
                  borderRadius: 14,
                  borderWidth: 0.5,
                  borderColor: CARD_BORDER,
                  overflow: 'hidden',
                }}>
                  <View style={{
                    backgroundColor: CHARCOAL,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <Text style={{
                      fontSize: 12, fontWeight: '700',
                      color: '#FFFFFF',
                    }}>
                      {room.name}
                    </Text>
                    <Text style={{
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.5)',
                    }}>
                      {area} sqft · {room.factor}x
                    </Text>
                  </View>

                  <View style={{ padding: 12 }}>
                    <View style={{
                      flexDirection: 'row', gap: 8,
                      marginBottom: 10,
                    }}>
                      <View style={{
                        width: 52, height: 44,
                        backgroundColor: BRAND_LIGHT,
                        borderWidth: 1.5,
                        borderColor: BRAND,
                        borderRadius: 6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: '700',
                          color: BRAND,
                        }}>
                          {length}×{width}
                        </Text>
                        <Text style={{
                          fontSize: 7, color: MUTED_LIGHT,
                          marginTop: 1,
                        }}>
                          ft
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{
                          flexDirection: 'row', gap: 6,
                        }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{
                              fontSize: 9, fontWeight: '600',
                              color: MUTED, marginBottom: 4,
                            }}>
                              Length (ft)
                            </Text>
                            <TextInput
                              value={
                                roomInputs[index]?.length ??
                                String(room.length)
                              }
                              onChangeText={(t) =>
                                onChangeRoomInput(index, 'length', t)
                              }
                              keyboardType="number-pad"
                              style={{
                                height: 34,
                                borderWidth: 0.5,
                                borderColor: CARD_BORDER,
                                borderRadius: 8,
                                paddingHorizontal: 8,
                                backgroundColor: PAGE_BG,
                                fontSize: 13,
                                color: CHARCOAL,
                                fontWeight: '700',
                              }}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{
                              fontSize: 9, fontWeight: '600',
                              color: MUTED, marginBottom: 4,
                            }}>
                              Width (ft)
                            </Text>
                            <TextInput
                              value={
                                roomInputs[index]?.width ??
                                String(room.width)
                              }
                              onChangeText={(t) =>
                                onChangeRoomInput(index, 'width', t)
                              }
                              keyboardType="number-pad"
                              style={{
                                height: 34,
                                borderWidth: 0.5,
                                borderColor: CARD_BORDER,
                                borderRadius: 8,
                                paddingHorizontal: 8,
                                backgroundColor: PAGE_BG,
                                fontSize: 13,
                                color: CHARCOAL,
                                fontWeight: '700',
                              }}
                            />
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={{
                      flexDirection: 'row', gap: 6,
                    }}>
                      <View style={{
                        flex: 1, backgroundColor: BRAND_LIGHT,
                        borderRadius: 8, padding: 8,
                        alignItems: 'center',
                      }}>
                        <Text style={{
                          fontSize: 8, color: MUTED,
                        }}>
                          Market
                        </Text>
                        <Text style={{
                          fontSize: 12, fontWeight: '800',
                          color: BRAND, marginTop: 2,
                        }}>
                          {formatINR(marketCost)}
                        </Text>
                      </View>
                      <View style={{
                        flex: 1, backgroundColor: '#EFF6FF',
                        borderRadius: 8, padding: 8,
                        alignItems: 'center',
                      }}>
                        <Text style={{
                          fontSize: 8, color: MUTED,
                        }}>
                          PWD SR
                        </Text>
                        <Text style={{
                          fontSize: 12, fontWeight: '800',
                          color: '#1D4ED8', marginTop: 2,
                        }}>
                          {formatINR(srCost)}
                        </Text>
                      </View>
                      <View style={{
                        flex: 1, backgroundColor: '#ECFDF5',
                        borderRadius: 8, padding: 8,
                        alignItems: 'center',
                      }}>
                        <Text style={{
                          fontSize: 8, color: MUTED,
                        }}>
                          Saving
                        </Text>
                        <Text style={{
                          fontSize: 12, fontWeight: '800',
                          color: '#166534', marginTop: 2,
                        }}>
                          {formatINR(saving)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )
            })}

            <View style={{
              backgroundColor: CHARCOAL,
              borderRadius: 12,
              padding: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 12, fontWeight: '700',
                color: '#FFFFFF',
              }}>
                Total ({ROOM_PRESETS.length} rooms)
              </Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{
                  fontSize: 16, fontWeight: '800',
                  color: BRAND,
                }}>
                  {formatINR(totalBudget)}
                </Text>
                <Text style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.4)',
                  marginTop: 1,
                }}>
                  market rate
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {activeTab === 'tracking' ? (
          <View style={{ margin: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                {
                  count: rows.filter(
                    (r) => r.actual > 0 && r.actual < r.estimate
                  ).length,
                  label: 'Under',
                  bg: '#DCFCE7',
                  border: '#BBF7D0',
                  color: '#166534',
                },
                {
                  count: rows.filter(
                    (r) => r.actual > r.estimate
                  ).length,
                  label: 'Over',
                  bg: '#FEE2E2',
                  border: '#FECACA',
                  color: RED,
                },
                {
                  count: rows.filter((r) => r.actual === 0).length,
                  label: 'Pending',
                  bg: PAGE_BG,
                  border: CARD_BORDER,
                  color: MUTED_LIGHT,
                },
              ].map((pill) => (
                <View key={pill.label} style={{
                  flex: 1,
                  backgroundColor: pill.bg,
                  borderWidth: 0.5,
                  borderColor: pill.border,
                  borderRadius: 10,
                  padding: 8,
                  alignItems: 'center',
                }}>
                  <Text style={{
                    fontSize: 16, fontWeight: '800',
                    color: pill.color,
                  }}>
                    {pill.count}
                  </Text>
                  <Text style={{
                    fontSize: 9, color: pill.color,
                    marginTop: 1,
                  }}>
                    {pill.label}
                  </Text>
                </View>
              ))}
            </View>

            {rows.map((row, index) => {
              const delta = row.actual - row.estimate
              const isOver = row.actual > 0 && delta > 0
              const isUnder = row.actual > 0 && delta < 0
              const isPending = row.actual === 0

              const headerBg = isOver
                ? '#DC2626'
                : isUnder
                  ? '#166534'
                  : CHARCOAL
              const badgeText = isPending
                ? 'Pending'
                : isOver
                  ? '⚠️ Over budget'
                  : isUnder
                    ? '✓ Under budget'
                    : '= On budget'
              const badgeBg = isPending
                ? 'rgba(255,255,255,0.1)'
                : isOver
                  ? 'rgba(255,255,255,0.2)'
                  : 'rgba(255,255,255,0.2)'

              return (
                <View key={row.stageKey} style={{
                  backgroundColor: CARD_BG,
                  borderRadius: 14,
                  borderWidth: 0.5,
                  borderColor: CARD_BORDER,
                  overflow: 'hidden',
                }}>
                  <View style={{
                    backgroundColor: headerBg,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{
                        width: 22, height: 22,
                        borderRadius: 6,
                        backgroundColor: 'rgba(255,255,255,0.2)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Text style={{
                          fontSize: 8, fontWeight: '800',
                          color: '#FFFFFF',
                        }}>
                          {`S${index + 1}`}
                        </Text>
                      </View>
                      <Text style={{
                        fontSize: 12, fontWeight: '700',
                        color: '#FFFFFF', flex: 1,
                      }} numberOfLines={1}>
                        {row.stageLabel}
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: badgeBg,
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}>
                      <Text style={{
                        fontSize: 8, fontWeight: '700',
                        color: '#FFFFFF',
                      }}>
                        {badgeText}
                      </Text>
                    </View>
                  </View>

                  <View style={{ padding: 12 }}>
                    <View style={{
                      flexDirection: 'row', gap: 6,
                      marginBottom: 10,
                    }}>
                      <View style={{
                        flex: 1, backgroundColor: PAGE_BG,
                        borderRadius: 8, padding: 7,
                        alignItems: 'center',
                      }}>
                        <Text style={{
                          fontSize: 7, color: MUTED_LIGHT,
                        }}>Estimated</Text>
                        <Text style={{
                          fontSize: 10, fontWeight: '800',
                          color: CHARCOAL, marginTop: 2,
                        }}>
                          {formatINR(row.estimate)}
                        </Text>
                      </View>
                      <View style={{
                        flex: 1,
                        backgroundColor: isPending
                          ? PAGE_BG
                          : isOver
                            ? '#FEE2E2'
                            : '#DCFCE7',
                        borderRadius: 8, padding: 7,
                        alignItems: 'center',
                      }}>
                        <Text style={{
                          fontSize: 7, color: MUTED_LIGHT,
                        }}>Actual</Text>
                        <Text style={{
                          fontSize: 10, fontWeight: '800',
                          color: isPending
                            ? MUTED_LIGHT
                            : isOver
                              ? RED
                              : '#166534',
                          marginTop: 2,
                        }}>
                          {isPending
                            ? '—'
                            : formatINR(row.actual)}
                        </Text>
                      </View>
                      <View style={{
                        flex: 1,
                        backgroundColor: isPending
                          ? PAGE_BG
                          : isOver
                            ? '#FEE2E2'
                            : '#DCFCE7',
                        borderRadius: 8, padding: 7,
                        alignItems: 'center',
                      }}>
                        <Text style={{
                          fontSize: 7, color: MUTED_LIGHT,
                        }}>Variance</Text>
                        <Text style={{
                          fontSize: 10, fontWeight: '800',
                          color: isPending
                            ? MUTED_LIGHT
                            : isOver
                              ? RED
                              : '#166534',
                          marginTop: 2,
                        }}>
                          {isPending
                            ? '—'
                            : `${delta > 0 ? '+' : ''}${formatINR(delta)}`}
                        </Text>
                      </View>
                    </View>

                    <Text style={{
                      fontSize: 9, color: MUTED_LIGHT,
                      marginBottom: 8,
                    }}>
                      Range: {formatINR(row.low)} –{' '}
                      {formatINR(row.high)} · SR: {formatINR(row.sr)}
                    </Text>

                    {!isPending ? (
                      <View style={{ marginBottom: 10, gap: 5 }}>
                        <View>
                          <View style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            marginBottom: 3,
                          }}>
                            <Text style={{
                              fontSize: 8, color: MUTED_LIGHT,
                            }}>
                              Estimated
                            </Text>
                            <Text style={{
                              fontSize: 8, color: BRAND,
                            }}>
                              {Math.round(
                                (row.estimate /
                                  Math.max(row.estimate, row.actual)) *
                                  100
                              )}%
                            </Text>
                          </View>
                          <View style={{
                            height: 6, backgroundColor: PAGE_BG,
                            borderRadius: 3, overflow: 'hidden',
                          }}>
                            <View style={{
                              height: 6, borderRadius: 3,
                              backgroundColor: BRAND,
                              width: `${Math.min(100, (row.estimate / Math.max(row.estimate, row.actual)) * 100)}%`,
                            }} />
                          </View>
                        </View>
                        <View>
                          <View style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            marginBottom: 3,
                          }}>
                            <Text style={{
                              fontSize: 8, color: MUTED_LIGHT,
                            }}>
                              Actual
                            </Text>
                            <Text style={{
                              fontSize: 8,
                              color: isOver ? RED : '#166534',
                            }}>
                              {Math.round(
                                (row.actual /
                                  Math.max(row.estimate, row.actual)) *
                                  100
                              )}%
                            </Text>
                          </View>
                          <View style={{
                            height: 6, backgroundColor: PAGE_BG,
                            borderRadius: 3, overflow: 'hidden',
                          }}>
                            <View style={{
                              height: 6, borderRadius: 3,
                              backgroundColor: isOver ? RED : '#166534',
                              width: `${Math.min(100, (row.actual / Math.max(row.estimate, row.actual)) * 100)}%`,
                            }} />
                          </View>
                        </View>
                      </View>
                    ) : null}

                    <TextInput
                      placeholder="Enter actual amount"
                      placeholderTextColor={MUTED_LIGHT}
                      keyboardType="number-pad"
                      value={row.actual ? String(Math.round(row.actual)) : ''}
                      onChangeText={(text) =>
                        onChangeActual(row.stageKey, text)
                      }
                      style={{
                        height: 40,
                        borderWidth: 0.5,
                        borderColor: CARD_BORDER,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        backgroundColor: PAGE_BG,
                        fontSize: 14,
                        color: CHARCOAL,
                        fontWeight: '600',
                      }}
                    />
                  </View>
                </View>
              )
            })}
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => void onSave()}
          disabled={saving}
          style={{
            marginHorizontal: 14,
            marginBottom: 14,
            marginTop: 4,
            height: 52,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: saving ? MUTED_LIGHT : BRAND,
          }}
        >
          <Text style={{
            color: '#FFFFFF',
            fontWeight: '700',
            fontSize: 15,
          }}>
            {saving ? 'Saving...' : 'Save Overview'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function MetricInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ marginBottom: 4, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d]/g, ''))}
        keyboardType="number-pad"
        style={{
          minHeight: 40,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          borderRadius: 10,
          paddingHorizontal: 10,
          backgroundColor: '#FFFFFF',
        }}
      />
    </View>
  )
}

function SelectMetric({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ label: string; value: string }>
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((opt) => opt.value === value)?.label ?? 'Select'
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ marginBottom: 4, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>{label}</Text>
      <View style={{ position: 'relative' }}>
        <TouchableOpacity
          onPress={() => setOpen((prev) => !prev)}
          style={{
            minHeight: 40,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            borderRadius: 10,
            paddingHorizontal: 10,
            backgroundColor: '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          activeOpacity={0.85}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{selected}</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {open ? (
          <View
            style={{
              position: 'absolute',
              top: 44,
              left: 0,
              right: 0,
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              overflow: 'hidden',
              zIndex: 20,
              elevation: 4,
            }}
          >
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  backgroundColor: value === opt.value ? '#FFF7ED' : '#FFFFFF',
                  borderBottomWidth: 1,
                  borderBottomColor: '#F2EDE8',
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: value === opt.value ? '#9A3412' : '#374151' }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ height: open ? 132 : 0 }}>
        {open ? (
          <View />
        ) : null}
      </View>
    </View>
  )
}


function KpiCard({
  title,
  value,
  tint,
  border,
  text,
}: {
  title: string
  value: string
  tint: string
  border: string
  text: string
}) {
  return (
    <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: tint, padding: 10 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#6B7280' }}>{title}</Text>
      <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '900', color: text }}>{value}</Text>
    </View>
  )
}

