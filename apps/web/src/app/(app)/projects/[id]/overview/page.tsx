'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type OverviewPayload = {
  rows?: Array<{ stageKey: string; floorIndex: number; stageLabel: string; actualCost: number }>
}

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

const MATERIAL_INPUTS = [
  { key: 'cement', label: 'Cement (bags)', qtyPerSqft: 0.36, low: 360, mid: 395, high: 430 },
  { key: 'steel', label: 'Steel (kg)', qtyPerSqft: 4.1, low: 48, mid: 52, high: 56 },
  { key: 'brick', label: 'Bricks (nos)', qtyPerSqft: 7.5, low: 5, mid: 6.5, high: 8 },
  { key: 'sandAgg', label: 'Sand + aggregate', qtyPerSqft: 0.06, low: 6500, mid: 7600, high: 9000 },
  { key: 'labour', label: 'Labour bundle', qtyPerSqft: 1, low: 320, mid: 420, high: 560 },
  { key: 'finishing', label: 'Finishing bundle', qtyPerSqft: 1, low: 420, mid: 640, high: 980 },
] as const

const SR_ITEMS = [
  { item: 'Earthwork excavation', srRate: 280, unit: 'cum', qtyPer1000Sqft: 45 },
  { item: 'RCC M20 footing + pedestals', srRate: 8200, unit: 'cum', qtyPer1000Sqft: 15 },
  { item: 'RCC slabs & beams', srRate: 8800, unit: 'cum', qtyPer1000Sqft: 18 },
  { item: 'Brickwork 230mm', srRate: 5200, unit: 'cum', qtyPer1000Sqft: 55 },
  { item: 'TMT steel Fe-500', srRate: 72000, unit: 'MT', qtyPer1000Sqft: 4.2 },
  { item: 'Plastering int/ext', srRate: 202, unit: 'sqm', qtyPer1000Sqft: 560 },
  { item: 'Vitrified flooring', srRate: 520, unit: 'sqm', qtyPer1000Sqft: 95 },
  { item: 'Electrical points', srRate: 1800, unit: 'point', qtyPer1000Sqft: 55 },
  { item: 'Plumbing points', srRate: 2200, unit: 'point', qtyPer1000Sqft: 22 },
] as const

const ROOM_PRESETS = [
  { name: 'Living Room', area: 168, factor: 1 },
  { name: 'Master Bedroom', area: 143, factor: 1.05 },
  { name: 'Bedroom 2', area: 120, factor: 0.98 },
  { name: 'Kitchen', area: 90, factor: 1.15 },
  { name: 'Dining', area: 80, factor: 0.95 },
  { name: 'Bathrooms (2)', area: 65, factor: 1.22 },
  { name: 'Staircase + Lobby', area: 70, factor: 1.1 },
  { name: 'Balcony/Utility', area: 55, factor: 0.8 },
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

function buildPlan(areaSqft: number, costPerSqft: number, floors: number, tier: TierKey, srOverheadPct: number, srGstPct: number) {
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

type BarPair = { label: string; a: number; b: number }

function WebSvgAreaChart({
  values,
  color,
  labels,
  height = 140,
  showDots = true,
}: {
  values: number[]
  color: string
  labels: string[]
  height?: number
  showDots?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(320)
  const gid = useId().replace(/:/g, '_')

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerWidth(Math.max(200, el.offsetWidth)))
    ro.observe(el)
    setContainerWidth(Math.max(200, el.offsetWidth))
    return () => ro.disconnect()
  }, [])

  const PAD_L = 38
  const PAD_R = 12
  const PAD_T = 14
  const PAD_B = 28
  const plotW = containerWidth - PAD_L - PAD_R
  const plotH = height - PAD_T - PAD_B
  const n = values.length
  const maxVal = Math.max(1, ...values)
  const yTicks = [0, 0.33, 0.66, 1].map((t) => Math.round(t * maxVal))

  const getX = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const getY = (v: number) => PAD_T + plotH - (v / maxVal) * plotH

  const pts = values.map((v, i) => `${getX(i)},${getY(v)}`).join(' ')
  const areaPath =
    n === 0
      ? ''
      : `M${getX(0)},${PAD_T + plotH} ${values.map((v, i) => `L${getX(i)},${getY(v)}`).join(' ')} L${getX(n - 1)},${PAD_T + plotH} Z`

  const formatY = (v: number): string => {
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`
    return `₹${v}`
  }

  return (
    <div ref={wrapRef} className="w-full">
      <svg width={containerWidth} height={height} className="block">
        <defs>
          <linearGradient id={`grad_${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.25" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = getY(tick)
          return (
            <g key={tick}>
              <line
                x1={PAD_L}
                y1={y}
                x2={containerWidth - PAD_R}
                y2={y}
                stroke={PAGE_BG}
                strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : '3 3'}
              />
              <text x={PAD_L - 4} y={y + 4} fontSize={8} fill={MUTED_LIGHT} textAnchor="end">
                {formatY(tick)}
              </text>
            </g>
          )
        })}
        <line x1={PAD_L} y1={PAD_T + plotH} x2={containerWidth - PAD_R} y2={PAD_T + plotH} stroke={CARD_BORDER} strokeWidth={1} />
        {areaPath ? <path d={areaPath} fill={`url(#grad_${gid})`} /> : null}
        {n > 1 ? (
          <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {showDots
          ? values.map((v, i) => (
              <circle key={i} cx={getX(i)} cy={getY(v)} r={3.5} fill={CARD_BG} stroke={color} strokeWidth={2} />
            ))
          : null}
        {labels.map((lbl, i) => {
          const step = n > 10 ? 3 : n > 6 ? 2 : 1
          if (i % step !== 0 && i !== n - 1) return null
          return (
            <text key={i} x={getX(i)} y={height - 4} fontSize={8} fill={MUTED_LIGHT} textAnchor="middle">
              {lbl}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

function WebSvgDualBarChart({
  pairs,
  colorA = BRAND,
  colorB = BLUE,
  labelA = 'Estimated',
  labelB = 'Actual',
  height = 170,
}: {
  pairs: BarPair[]
  colorA?: string
  colorB?: string
  labelA?: string
  labelB?: string
  height?: number
}) {
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    value: number
    color: string
    barLabel: string
    seriesLabel: string
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

  const maxVal = Math.max(1, ...pairs.flatMap((p) => [p.a, p.b]))
  const yMax = maxVal < 10000 ? Math.ceil(maxVal / 1000) * 1000 : Math.ceil(maxVal / 10000) * 10000
  const yTicks: number[] = []
  const tickCount = 4
  for (let i = 0; i <= tickCount; i++) yTicks.push(Math.round((i / tickCount) * yMax))

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

  const inrFmt = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  })

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center gap-3.5 text-[10px]" style={{ color: MUTED }}>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorA }} />
          {labelA}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colorB }} />
          {labelB}
        </span>
        <span className="ml-auto italic text-[9px]" style={{ color: MUTED_LIGHT }}>
          Click bars for values
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <svg width={svgW} height={height} className="block shrink-0">
          {yTicks.map((tick) => {
            const y = by(tick)
            return (
              <g key={tick}>
                <line
                  x1={PAD_L}
                  y1={y}
                  x2={svgW - PAD_R}
                  y2={y}
                  stroke={PAGE_BG}
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : '3 3'}
                />
                <text x={PAD_L - 4} y={y + 4} fontSize={8} fill={MUTED_LIGHT} textAnchor="end">
                  {fmt(tick)}
                </text>
              </g>
            )
          })}
          <line x1={PAD_L} y1={baseY} x2={svgW - PAD_R} y2={baseY} stroke={CARD_BORDER} strokeWidth={1} />

          {pairs.map((pair, i) => {
            const ax = gx(i)
            const bx = ax + BAR_W + BAR_GAP
            const dimA = tooltip && (tooltip.barLabel !== pair.label || tooltip.seriesLabel !== labelA)
            const dimB = tooltip && (tooltip.barLabel !== pair.label || tooltip.seriesLabel !== labelB)

            return (
              <g key={`${pair.label}_${i}`}>
                <rect
                  role="button"
                  tabIndex={0}
                  x={ax}
                  y={by(pair.a)}
                  width={BAR_W}
                  height={bh(pair.a)}
                  rx={3}
                  fill={colorA}
                  opacity={dimA ? 0.3 : 1}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (tooltip?.barLabel === pair.label && tooltip?.seriesLabel === labelA) setTooltip(null)
                    else
                      setTooltip({
                        x: ax + BAR_W / 2,
                        y: by(pair.a),
                        value: pair.a,
                        color: colorA,
                        barLabel: pair.label,
                        seriesLabel: labelA,
                      })
                  }}
                />
                <rect
                  role="button"
                  tabIndex={0}
                  x={bx}
                  y={by(pair.b)}
                  width={BAR_W}
                  height={bh(pair.b)}
                  rx={3}
                  fill={colorB}
                  opacity={dimB ? 0.3 : 1}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (tooltip?.barLabel === pair.label && tooltip?.seriesLabel === labelB) setTooltip(null)
                    else
                      setTooltip({
                        x: bx + BAR_W / 2,
                        y: by(pair.b),
                        value: pair.b,
                        color: colorB,
                        barLabel: pair.label,
                        seriesLabel: labelB,
                      })
                  }}
                />
                <text x={ax + BAR_W + BAR_GAP / 2} y={baseY + 14} fontSize={7} fill={MUTED_LIGHT} textAnchor="middle">
                  {pair.label.length > 6 ? `${pair.label.slice(0, 5)}…` : pair.label}
                </text>
              </g>
            )
          })}

          {tooltip
            ? (() => {
                const TW = 90
                const TH = 42
                const tx = Math.max(PAD_L, Math.min(tooltip.x - TW / 2, svgW - TW - PAD_R))
                const ty = Math.max(PAD_T, tooltip.y - TH - 8)
                return (
                  <g>
                    <rect x={tx} y={ty} width={TW} height={TH} rx={8} fill={CHARCOAL} opacity={0.95} />
                    <text x={tx + TW / 2} y={ty + 14} fontSize={8} fill={tooltip.color} textAnchor="middle" fontWeight={700}>
                      {tooltip.seriesLabel}
                    </text>
                    <text x={tx + TW / 2} y={ty + 30} fontSize={10} fill="#FFFFFF" textAnchor="middle" fontWeight={800}>
                      {inrFmt.format(tooltip.value)}
                    </text>
                  </g>
                )
              })()
            : null}
        </svg>
      </div>

      {tooltip ? (
        <button
          type="button"
          onClick={() => setTooltip(null)}
          className="mx-auto mt-1 block rounded-full px-3 py-0.5 text-[9px]"
          style={{ backgroundColor: PAGE_BG, color: MUTED }}
        >
          Click to dismiss
        </button>
      ) : null}
    </div>
  )
}

function WebSvgDonutChart({
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

  type DonutPath = { color: string; value: number; label: string; dash: number; gap: number; rotate: number }
  const paths = segments.reduce(
    (acc: { running: number; rows: DonutPath[] }, seg) => {
      const frac = total > 0 ? seg.value / total : 0
      const dash = frac * circumference
      const gap = circumference - dash
      const offset = acc.running
      const rotate = -90 + (offset / circumference) * 360
      acc.running += dash
      acc.rows.push({ ...seg, dash, gap, rotate })
      return acc
    },
    { running: 0, rows: [] as DonutPath[] }
  ).rows

  const fmt = (v: number) =>
    v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}K`

  return (
    <div className="flex flex-row flex-wrap items-center gap-3">
      <svg width={size} height={size} className="shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={PAGE_BG} strokeWidth={strokeW} />
        {paths.map((seg, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeW}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            transform={`rotate(${seg.rotate} ${cx} ${cy})`}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fontWeight={800} fill={CHARCOAL}>
          {fmt(total)}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill={MUTED}>
          budget
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
              <span className="truncate text-[9px]" style={{ color: MUTED }}>
                {seg.label}
              </span>
            </span>
            <span className="shrink-0 text-[9px] font-bold" style={{ color: CHARCOAL }}>
              {fmt(seg.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [areaSqft, setAreaSqft] = useState('1800')
  const [costPerSqft, setCostPerSqft] = useState('2000')
  const [floors, setFloors] = useState('2')
  const [tier, setTier] = useState<TierKey>('medium')
  const [srOverheadPct, setSrOverheadPct] = useState('18')
  const [srGstPct, setSrGstPct] = useState('5')
  const [activeTab, setActiveTab] = useState<'market' | 'sr' | 'building' | 'tracking'>('market')
  const [savedActuals, setSavedActuals] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)

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
      rows: plan.rows.map((row) => ({ ...row, actual: savedActuals[row.stageKey] ?? 0 })),
    }
  }, [numericArea, numericCost, numericFloors, tier, numericOverhead, numericGst, savedActuals])

  const estimatedTotal = rows.reduce((sum, row) => sum + row.estimate, 0)
  const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0)
  const variance = actualTotal - estimatedTotal
  const stageCodes = rows.map((_, index) => `S${index + 1}`)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('Please login again.')
        setLoading(false)
        return
      }
      const response = await fetch(`/api/projects/${projectId}/overview`, { cache: 'no-store' })
      const payload = (await response.json()) as OverviewPayload & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Failed to load overview')
      const map: Record<string, number> = {}
      for (const row of payload.rows ?? []) map[row.stageKey] = Number(row.actualCost ?? 0)
      setSavedActuals(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview')
    } finally {
      setLoading(false)
    }
  }, [projectId, supabase])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/overview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: rows.map((row) => ({
            stageKey: row.stageKey,
            floorIndex: row.floorIndex,
            stageLabel: row.stageLabel,
            actualCost: row.actual,
          })),
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Failed to save')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save overview')
    } finally {
      setSaving(false)
    }
  }

  const srItemProjected = (item: (typeof SR_ITEMS)[number]) =>
    item.srRate * item.qtyPer1000Sqft * (numericArea / 1000) * (1 + numericOverhead / 100 + numericGst / 100)

  const maxSrBreakdown = Math.max(
    1,
    ...SR_ITEMS.map((item) => item.srRate * item.qtyPer1000Sqft * (numericArea / 1000))
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm" style={{ backgroundColor: PAGE_BG, color: MUTED }}>
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto w-full max-w-lg px-3.5 pt-3">
        <header className="-mx-3.5 rounded-b-none px-3.5 pb-4 pt-3.5" style={{ backgroundColor: CHARCOAL }}>
          <div className="mb-2 flex items-center gap-2">
            <Link href={`/projects/${projectId}`} className="text-sm text-white/70 transition hover:text-white">
              ← Back
            </Link>
          </div>
          <h1 className="text-xl font-extrabold text-white">Project Overview</h1>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              ['market', 'Market'],
              ['sr', 'PWD SR'],
              ['building', 'Building'],
              ['tracking', 'Tracker'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as typeof activeTab)}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition"
                style={{
                  backgroundColor: activeTab === key ? BRAND : 'rgba(255,255,255,0.12)',
                  border: `0.5px solid ${activeTab === key ? BRAND : 'rgba(255,255,255,0.2)'}`,
                  color: activeTab === key ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <section
          className="mt-3.5 rounded-[14px] border p-3"
          style={{ borderColor: BRAND_BORDER, backgroundColor: BRAND_LIGHT }}
        >
          <p className="mb-2.5 text-[11px] font-bold tracking-wide" style={{ color: MUTED }}>
            PROJECT PARAMETERS
          </p>
          <div className="grid grid-cols-3 gap-2">
            <TierSelect
              label="Tier"
              value={tier}
              onChange={(next) => {
                setTier(next)
                setCostPerSqft(String(TIER_BANDS[next].reference))
              }}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
            <Metric label="SR overhead %" value={srOverheadPct} onChange={setSrOverheadPct} />
            <Metric label="SR GST %" value={srGstPct} onChange={setSrGstPct} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Metric label="Cost / sqft" value={costPerSqft} onChange={setCostPerSqft} />
            <Metric label="Area (sqft)" value={areaSqft} onChange={setAreaSqft} />
            <Metric label="Floors" value={floors} onChange={setFloors} />
          </div>
        </section>

        <div className="mt-3.5 flex gap-2">
          <KpiCard title="Est. Budget" value={formatINR(totalBudget)} tint="#EFF6FF" border="#BFDBFE" text="#1E3A8A" />
          <KpiCard title="Actual Spent" value={formatINR(actualTotal)} tint={BRAND_LIGHT} border={BRAND_BORDER} text={BRAND_DARK} />
          <KpiCard
            title="Variance"
            value={`${variance >= 0 ? '+' : ''}${formatINR(variance)}`}
            tint={variance > 0 ? '#FEF2F2' : variance < 0 ? '#ECFDF5' : PAGE_BG}
            border={variance > 0 ? '#FECACA' : variance < 0 ? '#BBF7D0' : CARD_BORDER}
            text={variance > 0 ? RED : variance < 0 ? '#166534' : MUTED}
          />
        </div>

        {activeTab === 'market' ? (
          <div className="mt-3 space-y-3">
            <section className="rounded-[14px] border p-3.5" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
              <p className="mb-3.5 text-xs font-bold" style={{ color: CHARCOAL }}>
                Budget Breakdown
              </p>
              <WebSvgDonutChart
                total={totalBudget}
                segments={[
                  { color: BRAND, value: totalBudget * 0.35, label: 'Structure (35%)' },
                  { color: '#F59E0B', value: totalBudget * 0.2, label: 'Masonry (20%)' },
                  { color: BLUE, value: totalBudget * 0.25, label: 'Finishing (25%)' },
                  { color: GREEN, value: totalBudget * 0.2, label: 'Others (20%)' },
                ]}
              />
            </section>

            <section className="rounded-[14px] border p-3.5" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: CHARCOAL }}>
                  Cost Projection Timeline
                </p>
                <p className="text-[9px] italic" style={{ color: MUTED_LIGHT }}>
                  Cumulative
                </p>
              </div>
              <WebSvgAreaChart
                values={cumulativeSeries(rows.map((r) => r.estimate))}
                labels={stageCodes}
                color={BRAND}
                height={140}
              />
              <div className="mt-2 rounded-lg p-2 text-center text-[10px]" style={{ backgroundColor: PAGE_BG, color: MUTED }}>
                Range band: {formatINR(lowTotal)} — {formatINR(highTotal)}
              </div>
            </section>

            <section className="rounded-[14px] border p-3.5" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
              <p className="mb-0.5 text-xs font-bold" style={{ color: CHARCOAL }}>
                Estimated vs Actual per Stage
              </p>
              <WebSvgDualBarChart
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
            </section>
          </div>
        ) : null}

        {activeTab === 'sr' ? (
          <div className="mt-3 space-y-3">
            <section className="rounded-[14px] p-3.5" style={{ backgroundColor: CHARCOAL }}>
              <p className="mb-2.5 text-[10px] font-bold tracking-wide text-white/40">MARKET vs PWD SR</p>
              <div className="flex gap-2.5">
                <div className="flex flex-1 flex-col items-center rounded-[10px] p-2.5" style={{ backgroundColor: 'rgba(216,90,48,0.2)' }}>
                  <span className="text-[9px] text-white/50">Market rate</span>
                  <span className="mt-0.5 text-lg font-extrabold" style={{ color: BRAND }}>
                    {formatINR(totalBudget)}
                  </span>
                  <span className="mt-0.5 text-[9px] text-white/40">{formatINR(numericCost)}/sqft</span>
                </div>
                <div className="flex flex-1 flex-col items-center rounded-[10px] p-2.5" style={{ backgroundColor: 'rgba(59,130,246,0.2)' }}>
                  <span className="text-[9px] text-white/50">PWD SR</span>
                  <span className="mt-0.5 text-lg font-extrabold text-[#93C5FD]">{formatINR(srTotal)}</span>
                  <span className="mt-0.5 text-[9px] text-white/40">{formatINR(srTotal / numericArea)}/sqft</span>
                </div>
              </div>
              <div className="mt-2.5 rounded-lg p-2 text-center text-[11px] font-bold" style={{ backgroundColor: 'rgba(16,185,129,0.15)', color: GREEN }}>
                Premium over SR: {formatINR(totalBudget - srTotal)}
              </div>
            </section>

            <section className="rounded-[14px] border p-3.5" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
              <p className="mb-3 text-xs font-bold" style={{ color: CHARCOAL }}>
                PWD SR Breakdown
              </p>
              <div className="space-y-2.5">
                {SR_ITEMS.map((item) => {
                  const itemTotalRaw = item.srRate * item.qtyPer1000Sqft * (numericArea / 1000)
                  const pct = itemTotalRaw / maxSrBreakdown
                  const projected = srItemProjected(item)
                  return (
                    <div key={item.item}>
                      <div className="mb-1 flex justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold" style={{ color: CHARCOAL }}>
                          {item.item}
                        </span>
                        <span className="shrink-0 text-[11px] font-bold" style={{ color: BRAND }}>
                          {formatINR(projected)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: PAGE_BG }}>
                        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: BRAND }} />
                      </div>
                      <p className="mt-0.5 text-[9px]" style={{ color: MUTED_LIGHT }}>
                        SR {formatINR(item.srRate)} · Qty {item.qtyPer1000Sqft}/1000sqft ({item.unit})
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'building' ? (
          <div className="mt-3 space-y-2.5">
            {ROOM_PRESETS.map((room) => {
              const marketCost = room.area * numericFloors * numericCost * room.factor
              const srCost = room.area * numericFloors * (srTotal / numericArea) * room.factor
              const saving = marketCost - srCost
              return (
                <article key={room.name} className="overflow-hidden rounded-[14px] border" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
                  <div className="flex items-center justify-between px-3.5 py-2.5" style={{ backgroundColor: CHARCOAL }}>
                    <span className="text-xs font-bold text-white">{room.name}</span>
                    <span className="text-[10px] text-white/50">
                      {room.area} sqft · {room.factor}x
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="mb-2.5 flex gap-2">
                      <div
                        className="flex h-11 w-[52px] shrink-0 flex-col items-center justify-center rounded-md border-[1.5px]"
                        style={{ borderColor: BRAND, backgroundColor: BRAND_LIGHT }}
                      >
                        <span className="text-[10px] font-bold" style={{ color: BRAND }}>
                          {room.area}
                        </span>
                        <span className="mt-px text-[7px]" style={{ color: MUTED_LIGHT }}>
                          sqft
                        </span>
                      </div>
                      <p className="flex flex-1 items-center text-[10px] leading-snug" style={{ color: MUTED }}>
                        Estimated allocation from total area × floors × rate × factor.
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <div className="flex flex-1 flex-col items-center rounded-lg p-2" style={{ backgroundColor: BRAND_LIGHT }}>
                        <span className="text-[8px]" style={{ color: MUTED }}>
                          Market
                        </span>
                        <span className="mt-0.5 text-xs font-extrabold" style={{ color: BRAND }}>
                          {formatINR(marketCost)}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col items-center rounded-lg p-2" style={{ backgroundColor: '#EFF6FF' }}>
                        <span className="text-[8px]" style={{ color: MUTED }}>
                          PWD SR
                        </span>
                        <span className="mt-0.5 text-xs font-extrabold text-[#1D4ED8]">{formatINR(srCost)}</span>
                      </div>
                      <div className="flex flex-1 flex-col items-center rounded-lg p-2" style={{ backgroundColor: '#ECFDF5' }}>
                        <span className="text-[8px]" style={{ color: MUTED }}>
                          Saving
                        </span>
                        <span className="mt-0.5 text-xs font-extrabold text-[#166534]">{formatINR(saving)}</span>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
            <div className="flex items-center justify-between rounded-xl px-3 py-3" style={{ backgroundColor: CHARCOAL }}>
              <span className="text-xs font-bold text-white">
                Total ({ROOM_PRESETS.length} rooms)
              </span>
              <div className="text-right">
                <p className="text-base font-extrabold" style={{ color: BRAND }}>
                  {formatINR(totalBudget)}
                </p>
                <p className="mt-px text-[9px] text-white/40">market rate</p>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'tracking' ? (
          <div className="mt-3 space-y-2.5">
            <div className="flex gap-2">
              {[
                {
                  count: rows.filter((r) => r.actual > 0 && r.actual < r.estimate).length,
                  label: 'Under',
                  bg: '#DCFCE7',
                  border: '#BBF7D0',
                  color: '#166534',
                },
                {
                  count: rows.filter((r) => r.actual > r.estimate).length,
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
                <div
                  key={pill.label}
                  className="flex flex-1 flex-col items-center rounded-[10px] border py-2"
                  style={{ backgroundColor: pill.bg, borderColor: pill.border }}
                >
                  <span className="text-base font-extrabold" style={{ color: pill.color }}>
                    {pill.count}
                  </span>
                  <span className="mt-px text-[9px]" style={{ color: pill.color }}>
                    {pill.label}
                  </span>
                </div>
              ))}
            </div>

            {rows.map((row, index) => {
              const delta = row.actual - row.estimate
              const isOver = row.actual > 0 && delta > 0
              const isUnder = row.actual > 0 && delta < 0
              const isPending = row.actual === 0
              const headerBg = isOver ? RED : isUnder ? '#166534' : CHARCOAL
              const badgeText = isPending ? 'Pending' : isOver ? '⚠️ Over budget' : isUnder ? '✓ Under budget' : '= On budget'
              const badgeBg = 'rgba(255,255,255,0.2)'

              return (
                <article key={row.stageKey} className="overflow-hidden rounded-[14px] border" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ backgroundColor: headerBg }}>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-white/20">
                        <span className="text-[8px] font-extrabold text-white">{`S${index + 1}`}</span>
                      </div>
                      <span className="truncate text-xs font-bold text-white">{row.stageLabel}</span>
                    </div>
                    <span className="shrink-0 rounded-lg px-2 py-0.5 text-[8px] font-bold text-white" style={{ backgroundColor: badgeBg }}>
                      {badgeText}
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="mb-2.5 flex gap-1.5">
                      <div className="flex flex-1 flex-col items-center rounded-lg py-1.5" style={{ backgroundColor: PAGE_BG }}>
                        <span className="text-[7px]" style={{ color: MUTED_LIGHT }}>
                          Estimated
                        </span>
                        <span className="mt-0.5 text-[10px] font-extrabold" style={{ color: CHARCOAL }}>
                          {formatINR(row.estimate)}
                        </span>
                      </div>
                      <div
                        className="flex flex-1 flex-col items-center rounded-lg py-1.5"
                        style={{
                          backgroundColor: isPending ? PAGE_BG : isOver ? '#FEE2E2' : '#DCFCE7',
                        }}
                      >
                        <span className="text-[7px]" style={{ color: MUTED_LIGHT }}>
                          Actual
                        </span>
                        <span
                          className="mt-0.5 text-[10px] font-extrabold"
                          style={{
                            color: isPending ? MUTED_LIGHT : isOver ? RED : '#166534',
                          }}
                        >
                          {isPending ? '—' : formatINR(row.actual)}
                        </span>
                      </div>
                      <div
                        className="flex flex-1 flex-col items-center rounded-lg py-1.5"
                        style={{
                          backgroundColor: isPending ? PAGE_BG : isOver ? '#FEE2E2' : '#DCFCE7',
                        }}
                      >
                        <span className="text-[7px]" style={{ color: MUTED_LIGHT }}>
                          Variance
                        </span>
                        <span
                          className="mt-0.5 text-[10px] font-extrabold"
                          style={{
                            color: isPending ? MUTED_LIGHT : isOver ? RED : '#166534',
                          }}
                        >
                          {isPending ? '—' : `${delta > 0 ? '+' : ''}${formatINR(delta)}`}
                        </span>
                      </div>
                    </div>
                    <p className="mb-2 text-[9px]" style={{ color: MUTED_LIGHT }}>
                      Range: {formatINR(row.low)} – {formatINR(row.high)} · SR: {formatINR(row.sr)}
                    </p>

                    {!isPending ? (
                      <div className="mb-2.5 space-y-1">
                        <div>
                          <div className="mb-0.5 flex justify-between text-[8px]" style={{ color: MUTED_LIGHT }}>
                            <span>Estimated</span>
                            <span style={{ color: BRAND }}>
                              {Math.round((row.estimate / Math.max(row.estimate, row.actual)) * 100)}%
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: PAGE_BG }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (row.estimate / Math.max(row.estimate, row.actual)) * 100)}%`,
                                backgroundColor: BRAND,
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5 flex justify-between text-[8px]" style={{ color: MUTED_LIGHT }}>
                            <span>Actual</span>
                            <span style={{ color: isOver ? RED : '#166534' }}>
                              {Math.round((row.actual / Math.max(row.estimate, row.actual)) * 100)}%
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: PAGE_BG }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (row.actual / Math.max(row.estimate, row.actual)) * 100)}%`,
                                backgroundColor: isOver ? RED : '#166534',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <input
                      value={row.actual ? String(Math.round(row.actual)) : ''}
                      onChange={(e) => {
                        const parsed = Number(e.target.value.replace(/[^\d]/g, ''))
                        setSavedActuals((prev) => ({ ...prev, [row.stageKey]: Number.isFinite(parsed) ? parsed : 0 }))
                      }}
                      placeholder="Enter actual amount"
                      className="h-10 w-full rounded-[10px] border px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-300/40"
                      style={{ borderColor: CARD_BORDER, backgroundColor: PAGE_BG, color: CHARCOAL }}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-4 w-full rounded-[14px] py-3.5 text-[15px] font-bold text-white shadow-sm transition disabled:opacity-60"
          style={{ backgroundColor: saving ? MUTED_LIGHT : BRAND }}
        >
          {saving ? 'Saving...' : 'Save Overview'}
        </button>
      </div>
    </div>
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
    <div className="flex-1 rounded-xl border p-2.5" style={{ borderColor: border, backgroundColor: tint }}>
      <p className="text-[10px] font-bold" style={{ color: '#6B7280' }}>
        {title}
      </p>
      <p className="mt-1 text-[15px] font-black leading-tight" style={{ color: text }}>
        {value}
      </p>
    </div>
  )
}

function Metric({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[11px] font-bold" style={{ color: '#6B7280' }}>
        {label}
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className="h-10 w-full min-w-0 rounded-[10px] border px-2.5 text-[13px] font-bold outline-none focus:border-orange-300"
        style={{ borderColor: '#E5E7EB', backgroundColor: CARD_BG, color: CHARCOAL }}
      />
    </div>
  )
}

function TierSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: TierKey
  onChange: (v: TierKey) => void
  options: Array<{ value: TierKey; label: string }>
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((opt) => opt.value === value)?.label ?? 'Select'

  return (
    <div className="relative min-w-0 flex-1">
      <p className="mb-1 text-[11px] font-bold" style={{ color: '#6B7280' }}>
        {label}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full min-w-0 items-center justify-between rounded-[10px] border px-2.5 text-left text-xs font-bold outline-none focus:border-orange-300"
        style={{ borderColor: '#E5E7EB', backgroundColor: CARD_BG, color: '#374151' }}
      >
        <span className="truncate">{selected}</span>
        <span className="shrink-0 text-[#6B7280]">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <ul
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-[10px] border shadow-md"
          style={{ borderColor: '#E5E7EB', backgroundColor: CARD_BG }}
        >
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className="w-full border-b px-2.5 py-2.5 text-left text-xs font-bold last:border-b-0"
                style={{
                  borderColor: PAGE_BG,
                  backgroundColor: value === opt.value ? '#FFF7ED' : CARD_BG,
                  color: value === opt.value ? '#9A3412' : '#374151',
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
