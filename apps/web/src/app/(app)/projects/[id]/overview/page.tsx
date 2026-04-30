'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

  const { totalBudget, lowTotal, highTotal, srTotal, materialTotals, rows } = useMemo(() => {
    const plan = buildPlan(numericArea, numericCost, numericFloors, tier, numericOverhead, numericGst)
    return {
      totalBudget: plan.totalBudget,
      lowTotal: plan.lowTotal,
      highTotal: plan.highTotal,
      srTotal: plan.srTotal,
      materialTotals: plan.materialTotals,
      rows: plan.rows.map((row) => ({ ...row, actual: savedActuals[row.stageKey] ?? 0 })),
    }
  }, [numericArea, numericCost, numericFloors, tier, numericOverhead, numericGst, savedActuals])

  const estimatedTotal = rows.reduce((sum, row) => sum + row.estimate, 0)
  const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0)
  const variance = actualTotal - estimatedTotal

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
    void load()
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

  const maxEstimate = Math.max(1, ...rows.map((r) => r.estimate))
  const maxActual = Math.max(1, ...rows.map((r) => Math.max(r.estimate, r.actual)))
  const cumulativeEstimate = cumulativeSeries(rows.map((r) => r.estimate))
  const cumulativeActual = cumulativeSeries(rows.map((r) => r.actual))
  const maxCumulativeEstimate = Math.max(1, ...cumulativeEstimate)
  const maxCumulativeActual = Math.max(1, ...cumulativeActual)
  const maxLowHigh = Math.max(1, ...rows.map((r) => r.high))
  const maxSr = Math.max(1, ...rows.map((r) => r.sr))
  const stageCodes = rows.map((_, index) => `S${index + 1}`)
  const chartCols = `repeat(${Math.max(rows.length, 1)}, minmax(30px, 1fr))`

  if (loading) return <div className="mx-auto min-h-screen w-full max-w-md p-4 text-sm text-gray-500">Loading...</div>

  return (
    <div className="min-h-screen bg-[#F7F7F5] p-4 pb-20">
      <div className="mx-auto mb-3 flex w-full max-w-6xl items-center gap-2">
        <Link href={`/projects/${projectId}`} className="rounded-md px-2 py-1 text-sm text-orange-700 hover:bg-orange-50">
          ← Back
        </Link>
        <h1 className="text-2xl font-extrabold text-gray-900">Project Overview</h1>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[280px,1fr]">
        <aside className="rounded-2xl border border-orange-100 bg-[#FFF8F3] p-4 shadow-sm lg:sticky lg:top-20 lg:self-start">
          <p className="text-sm font-bold text-gray-800">Project Parameters</p>
          <div className="mt-3 space-y-3">
            <SelectField
              label="Cost tier"
              value={tier}
              onChange={(v) => {
                const next = v as TierKey
                setTier(next)
                setCostPerSqft(String(TIER_BANDS[next].reference))
              }}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
            <Metric label="Cost / sqft" value={costPerSqft} onChange={setCostPerSqft} />
            <Metric label="Area (sqft)" value={areaSqft} onChange={setAreaSqft} />
            <Metric label="Floors" value={floors} onChange={setFloors} />
            <Metric label="SR overhead %" value={srOverheadPct} onChange={setSrOverheadPct} />
            <Metric label="SR GST %" value={srGstPct} onChange={setSrGstPct} />
          </div>
          <div className="mt-4 rounded-xl border border-orange-200 bg-white p-3">
            <p className="text-xs font-semibold text-gray-500">Total Stages</p>
            <p className="text-lg font-extrabold text-gray-900">{rows.length}</p>
            <p className="mt-2 text-xs font-semibold text-gray-500">Total Estimate</p>
            <p className="text-base font-bold text-[#D85A30]">{formatINR(estimatedTotal)}</p>
            <p className="mt-2 text-xs font-semibold text-gray-500">Tier range</p>
            <p className="text-xs font-semibold text-gray-700">
              {formatINR(lowTotal)} to {formatINR(highTotal)}
            </p>
          </div>
        </aside>

        <main className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              ['market', 'Market Estimate'],
              ['sr', 'PWD SR rate/sqft'],
              ['building', 'Individual Building'],
              ['tracking', 'Live Tracker'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  activeTab === key ? 'bg-orange-600 text-white' : 'bg-white text-gray-700 border border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard title="Estimated Budget" value={formatINR(totalBudget)} tone="blue" />
            <KpiCard title="Actual Spent" value={formatINR(actualTotal)} tone="orange" />
            <KpiCard
              title="Cost Variance"
              value={`${variance >= 0 ? '+' : '-'}${formatINR(Math.abs(variance))}`}
              tone={variance > 0 ? 'red' : variance < 0 ? 'green' : 'slate'}
            />
          </div>

          {activeTab === 'market' ? (
            <>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-bold text-gray-900">Cost Projection Timeline</p>
              <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                <LegendDot colorClass="bg-emerald-500" label="Low band" />
                <LegendDot colorClass="bg-sky-500" label="Estimated" />
                <LegendDot colorClass="bg-amber-500" label="High band" />
              </div>
            </div>
            <LineSeriesChart
              labels={stageCodes}
              series={[
                { label: 'Low', color: '#22C55E', values: rows.map((row) => row.low) },
                { label: 'Estimated', color: '#0EA5E9', values: rows.map((row) => row.estimate) },
                { label: 'High', color: '#F59E0B', values: rows.map((row) => row.high) },
              ]}
            />
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-bold text-gray-900">Actual vs Estimated</p>
              <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                <LegendDot colorClass="bg-sky-500" label="Estimated" />
                <LegendDot colorClass="bg-orange-500" label="Actual" />
                <LegendDot colorClass="bg-blue-800" label="PWD SR" />
              </div>
            </div>
            <LineSeriesChart
              labels={stageCodes}
              series={[
                { label: 'Estimated', color: '#0EA5E9', values: rows.map((row) => row.estimate) },
                { label: 'Actual', color: '#F97316', values: rows.map((row) => row.actual) },
                { label: 'PWD SR', color: '#1E40AF', values: rows.map((row) => row.sr) },
              ]}
            />
            </section>
          </div>
            </>
          ) : null}

          {activeTab === 'sr' ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-lg font-bold text-gray-900">PWD SR rate / sqft analysis</p>
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <KpiCard title="PWD SR total" value={formatINR(srTotal)} tone="slate" />
                <KpiCard title="PWD SR rate/sqft" value={formatINR(srTotal / numericArea)} tone="blue" />
                <KpiCard title="Market premium" value={formatINR(totalBudget - srTotal)} tone={totalBudget - srTotal >= 0 ? 'red' : 'green'} />
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-left">SR rate</th>
                      <th className="px-3 py-2 text-left">Qty/1000 sqft</th>
                      <th className="px-3 py-2 text-left">Projected cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SR_ITEMS.map((item) => (
                      <tr key={item.item} className="border-t border-gray-100">
                        <td className="px-3 py-2">{item.item}</td>
                        <td className="px-3 py-2">{formatINR(item.srRate)}</td>
                        <td className="px-3 py-2">{item.qtyPer1000Sqft}</td>
                        <td className="px-3 py-2">{formatINR(item.srRate * item.qtyPer1000Sqft * (numericArea / 1000) * (1 + numericOverhead / 100 + numericGst / 100))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === 'building' ? (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-lg font-bold text-gray-900">Individual Building Estimation</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {ROOM_PRESETS.map((room) => {
                  const marketCost = room.area * numericFloors * numericCost * room.factor
                  const srCost = room.area * numericFloors * (srTotal / numericArea) * room.factor
                  return (
                    <div key={room.name} className="rounded-lg border border-gray-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-gray-900">{room.name}</p>
                      <p className="text-xs text-gray-600">{room.area} sqft / floor · factor {room.factor}x</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-gray-500">Market</span>
                        <span className="font-semibold text-sky-700">{formatINR(marketCost)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-gray-500">PWD SR</span>
                        <span className="font-semibold text-blue-800">{formatINR(srCost)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          {activeTab === 'tracking' ? (
            <>
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-bold text-gray-800">Stage Code Legend</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row, index) => (
                <div key={`${row.stageKey}_legend`} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{`S${index + 1}`}</span>
                  <span className="truncate text-xs text-slate-700">{row.stageLabel}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-lg font-bold text-gray-900">Stage-wise Tracking</p>
            <div className="max-h-[460px] overflow-auto rounded-xl border border-gray-100">
              {rows.map((row, index) => {
                const delta = row.actual - row.estimate
                return (
                  <div key={row.stageKey} className="grid grid-cols-[56px,1fr] items-start gap-3 border-b border-gray-100 p-3 last:border-b-0">
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-center text-xs font-bold text-slate-600">{`S${index + 1}`}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{row.stageLabel}</p>
                      <p className="text-xs text-gray-500">Estimated: {formatINR(row.estimate)} · PWD SR: {formatINR(row.sr)}</p>
                      <p className="text-[11px] text-gray-500">Range: {formatINR(row.low)} to {formatINR(row.high)}</p>
                      <input
                        value={row.actual ? String(Math.round(row.actual)) : ''}
                        onChange={(e) => {
                          const parsed = Number(e.target.value.replace(/[^\d]/g, ''))
                          setSavedActuals((prev) => ({ ...prev, [row.stageKey]: Number.isFinite(parsed) ? parsed : 0 }))
                        }}
                        placeholder="Enter actual amount"
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-300 focus:outline-none"
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <p className={`text-xs font-semibold ${delta > 0 ? 'text-red-700' : delta < 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
                          Variance: {delta > 0 ? '+' : ''}
                          {formatINR(delta)}
                        </p>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            row.actual === 0
                              ? 'bg-gray-100 text-gray-500'
                              : delta > 0
                                ? 'bg-red-100 text-red-700'
                                : delta < 0
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.actual === 0 ? 'Pending' : delta > 0 ? 'Over budget' : delta < 0 ? 'Under budget' : 'On budget'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
            </>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            onClick={() => void save()}
            disabled={saving}
            className="w-full rounded-xl bg-[#D85A30] py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Overview'}
          </button>
        </main>
      </div>
    </div>
  )
}

function KpiCard({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone: 'blue' | 'orange' | 'green' | 'red' | 'slate'
}) {
  const tones: Record<typeof tone, string> = {
    blue: 'border-sky-200 bg-sky-50 text-sky-800',
    orange: 'border-orange-200 bg-orange-50 text-orange-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  }
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-1 text-xl font-extrabold">{value}</p>
    </div>
  )
}

function LineSeriesChart({
  labels,
  series,
}: {
  labels: string[]
  series: Array<{ label: string; color: string; values: number[] }>
}) {
  const chartHeight = 220
  const width = Math.max(880, labels.length * 52)
  const maxVal = Math.max(1, ...series.flatMap((item) => item.values))
  const xStep = labels.length > 1 ? width / (labels.length - 1) : width

  const pointsFor = (values: number[]) =>
    values.map((value, idx) => {
      const x = idx * xStep
      const y = chartHeight - (value / maxVal) * (chartHeight - 20) - 10
      return { x, y, value }
    })

  const pathFor = (values: number[]) =>
    pointsFor(values)
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
      .join(' ')

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[880px]">
        <svg width={width} height={chartHeight + 16} className="border-b border-l border-gray-200 bg-gradient-to-b from-slate-50 to-white">
          {series.map((item) => (
            <path key={item.label} d={pathFor(item.values)} fill="none" stroke={item.color} strokeWidth="2.5" />
          ))}
          {series.map((item) =>
            pointsFor(item.values).map((pt, idx) => (
              <circle key={`${item.label}_${idx}`} cx={pt.x} cy={pt.y} r="3" fill={item.color} />
            ))
          )}
        </svg>
        <div className="mt-2 grid px-1" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(40px, 1fr))` }}>
          {labels.map((label) => (
            <p key={label} className="text-center text-[11px] font-semibold text-gray-500">
              {label}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

function LegendDot({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${colorClass}`} />
      <span>{label}</span>
    </div>
  )
}

function Metric({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-gray-600">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-orange-300 focus:outline-none"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-gray-600">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-orange-300 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
