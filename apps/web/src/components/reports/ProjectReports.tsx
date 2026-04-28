'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BlobProvider, Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import FinancialSetupForm from '@/components/reports/FinancialSetupForm'

type ScheduleItem = { stage: string; label: string; percentage: number }
type ReportsResponse = {
  hasFinancialSetup: boolean
  projectName?: string
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
  chartData?: {
    estimated: Array<{ stage: string; label: string; amount: number; cumulative: number }>
    actual: Array<{ stage: string; label: string; amount: number; cumulative: number }>
  }
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
  confirmedPayments?: Array<{
    id: string
    amount: number
    paid_at: string
    paid_to_category: string
    payment_mode: string
    paid_to_name: string
    description: string
  }>
}

type SetupResponse = {
  exists: boolean
  defaultSchedule?: ScheduleItem[]
  financials?: Record<string, unknown>
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const pdfStyles = StyleSheet.create({
  page: { padding: 20, fontSize: 11 },
  title: { fontSize: 16, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 4, marginTop: 8 },
  cell: { flex: 1 },
})

function statusStyle(status: 'paid' | 'partial' | 'due' | 'upcoming') {
  if (status === 'paid') return 'border-l-green-500 bg-green-50'
  if (status === 'partial') return 'border-l-amber-500 bg-amber-50'
  if (status === 'due') return 'border-l-orange-500 bg-orange-50'
  return 'border-l-gray-300 bg-gray-50'
}

export default function ProjectReports({ projectId }: { projectId: string; currentUserRole: string }) {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<ReportsResponse | null>(null)
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [materialSaving, setMaterialSaving] = useState(false)
  const [cementRate, setCementRate] = useState('')
  const [steelRate, setSteelRate] = useState('')
  const [autoExportTriggered, setAutoExportTriggered] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [reportsRes, setupRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/reports`, { cache: 'no-store' }),
        fetch(`/api/projects/${projectId}/financials/setup`, { cache: 'no-store' }),
      ])
      const reportsJson = (await reportsRes.json()) as ReportsResponse & { error?: string }
      const setupJson = (await setupRes.json()) as SetupResponse & { error?: string }
      if (!reportsRes.ok) throw new Error(reportsJson.error ?? 'Failed to fetch reports')
      if (!setupRes.ok) throw new Error(setupJson.error ?? 'Failed to fetch setup')
      setReports(reportsJson)
      setSetup(setupJson)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [projectId])

  const chartMerged = useMemo(() => {
    const est = reports?.chartData?.estimated ?? []
    const act = reports?.chartData?.actual ?? []
    return est.map((row, index) => ({
      stage: row.label,
      estimated: row.cumulative,
      actual: act[index]?.cumulative ?? 0,
    }))
  }, [reports?.chartData?.actual, reports?.chartData?.estimated])

  const categoryRows = useMemo(() => {
    if (!reports?.categoryBudget || !reports.stagePayments) return []
    const entries = Object.entries(reports.categoryBudget)
    const totalActual = reports.overview?.totalActualSpent ?? 0
    return entries.map(([name, percent]) => ({
      name,
      budgeted: ((percent ?? 0) / 100) * (reports.overview?.totalContractAmount ?? 0),
      actual: ((percent ?? 0) / 100) * totalActual,
    }))
  }, [reports])
  const exportRequested = searchParams.get('export') === 'pdf'

  const saveMaterialRates = async () => {
    setMaterialSaving(true)
    try {
      const payload: { cement_rate?: number; steel_rate?: number } = {}
      if (cementRate) payload.cement_rate = Number(cementRate)
      if (steelRate) payload.steel_rate = Number(steelRate)
      const response = await fetch(`/api/projects/${projectId}/material-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await response.json()) as { success?: boolean; error?: string }
      if (!response.ok || !json.success) throw new Error(json.error ?? 'Failed to save prices')
      toast.success('Material prices updated')
      setCementRate('')
      setSteelRate('')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save rates')
    } finally {
      setMaterialSaving(false)
    }
  }

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>
  }

  if (!reports?.hasFinancialSetup) {
    return (
      <>
        <div className="rounded-2xl border border-orange-100 bg-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-3xl text-orange-500">📈</div>
          <h3 className="text-xl font-bold text-gray-900">Set up financial tracking</h3>
          <p className="mt-2 text-sm text-gray-500">
            Track estimated vs actual costs, get alerts when material prices rise, and generate a full payment blueprint PDF.
          </p>
          <Button className="mt-5" onClick={() => setShowSetup(true)}>
            Set up now
          </Button>
        </div>
        {showSetup ? (
          <div className="fixed inset-0 z-50 bg-black/40 p-4">
            <div className="absolute right-4 bottom-0 left-4 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Financial Setup</h3>
                <button type="button" onClick={() => setShowSetup(false)} className="text-sm text-gray-500">Close</button>
              </div>
              <FinancialSetupForm
                projectId={projectId}
                defaultSchedule={setup?.defaultSchedule ?? []}
                onSuccess={() => {
                  setShowSetup(false)
                  void load()
                }}
              />
            </div>
          </div>
        ) : null}
      </>
    )
  }

  const overview = reports.overview
  if (!overview) return null

  return (
    <div className="space-y-4 pb-6">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-gray-500">Total contract value</p><p className="text-lg font-bold">{inr.format(overview.totalContractAmount)}</p></div>
        <div className="rounded-xl bg-blue-50 p-3"><p className="text-xs text-blue-700">Expected by this stage</p><p className="text-lg font-bold text-blue-800">{inr.format(overview.totalEstimatedSoFar)}</p><p className="text-[11px] text-blue-500">based on payment schedule</p></div>
        <div className="rounded-xl bg-orange-50 p-3"><p className="text-xs text-orange-700">Actually paid so far</p><p className="text-lg font-bold text-orange-800">{inr.format(overview.totalActualSpent)}</p></div>
        <div className={`rounded-xl p-3 ${overview.variance >= 0 ? 'bg-green-50' : 'bg-red-50'}`}><p className="text-xs">{overview.variance >= 0 ? 'Under budget' : 'Over budget'}</p><p className="text-lg font-bold">{inr.format(Math.abs(overview.variance))}</p><p className="text-[11px]">{inr.format(Math.abs(overview.variance))} {overview.varianceLabel}</p></div>
      </section>

      <section className="rounded-xl bg-white p-3">
        <h4 className="mb-2 font-semibold text-gray-900">Estimated vs Actual Spending</h4>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartMerged}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `${(Number(v) / 100000).toFixed(1)}L`} />
              <Tooltip
                formatter={(value: number, name: string) => [inr.format(Number(value)), name]}
              />
              <Legend />
              <Line type="monotone" dataKey="estimated" stroke="#E8590C" strokeWidth={2.5} dot={false} name="Estimated" />
              <Line type="monotone" dataKey="actual" stroke="#3B82F6" strokeDasharray="6 3" strokeWidth={2} dot name="Actual" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl bg-white p-3">
        <h4 className="mb-2 font-semibold text-gray-900">Stage-wise Payment Tracker</h4>
        <div className="space-y-2">
          {(reports.stagePayments ?? []).map((row) => (
            <div key={row.stage} className={`rounded-lg border-l-4 p-3 ${statusStyle(row.status)}`}>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-900">{row.label}</p>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium capitalize">{row.status}</span>
              </div>
              <p className="text-xs text-gray-500">Expected: {inr.format(row.expectedAmount)}</p>
              <p className="text-sm text-gray-700">Actual: {inr.format(row.actualPaidAmount)}</p>
            </div>
          ))}
        </div>
      </section>

      {categoryRows.length > 0 ? (
        <section className="rounded-xl bg-white p-3">
          <h4 className="mb-2 font-semibold text-gray-900">Spending by category</h4>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(Number(v) / 100000).toFixed(1)}L`} />
                <Tooltip formatter={(value: number) => inr.format(Number(value))} />
                <Legend />
                <Bar dataKey="budgeted" fill="#93C5FD" name="Budgeted" />
                <Bar dataKey="actual" fill="#E8590C" name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      {(reports.escalationAlerts ?? []).length > 0 ? (
        <section className="rounded-xl bg-white p-3">
          <h4 className="mb-2 font-semibold text-gray-900">Material Price Alerts</h4>
          <div className="space-y-2">
            {(reports.escalationAlerts ?? []).map((alert) => (
              <div key={alert.material} className={`rounded-lg p-3 ${alert.isAboveThreshold ? 'bg-red-50' : 'bg-green-50'}`}>
                <p className="font-semibold">{alert.isAboveThreshold ? '⚠️' : '✅'} {alert.material}</p>
                <p className="text-xs">Agreed rate: {inr.format(alert.agreedRate)} | Current: {inr.format(alert.currentRate)} | +{alert.increasePercent.toFixed(1)}%</p>
                {alert.isAboveThreshold ? <p className="text-xs font-medium">Extra cost estimate: {inr.format(alert.estimatedExtraCost)}</p> : <p className="text-xs">Within agreed rates</p>}
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input type="number" className="h-10 rounded-md border border-gray-200 px-2 text-sm" placeholder="Cement ₹/bag" value={cementRate} onChange={(e) => setCementRate(e.target.value)} />
            <input type="number" className="h-10 rounded-md border border-gray-200 px-2 text-sm" placeholder="Steel ₹/kg" value={steelRate} onChange={(e) => setSteelRate(e.target.value)} />
          </div>
          <Button className="mt-2" onClick={() => void saveMaterialRates()} disabled={materialSaving}>
            {materialSaving ? 'Saving...' : 'Update material prices'}
          </Button>
        </section>
      ) : null}

      {reports.timeline ? (
        <section className="rounded-xl bg-white p-3">
          <h4 className="font-semibold text-gray-900">Project Timeline</h4>
          <div className="mt-2 h-2 rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.min(100, reports.timeline.progressPercent)}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-500">
            <span>{reports.timeline.startDate}</span>
            <span>{reports.timeline.expectedEndDate}</span>
          </div>
          <p className="mt-2 text-sm text-gray-700">Current stage: {reports.timeline.currentStage} • {reports.timeline.monthsElapsed} / {reports.timeline.totalMonths} months</p>
          <p className={`text-sm ${reports.timeline.isDelayed ? 'text-amber-600' : 'text-green-600'}`}>
            {reports.timeline.isDelayed ? 'Estimated delay risk' : 'On track'}
          </p>
        </section>
      ) : null}

      <BlobProvider
        document={
          <Document>
            <Page size="A4" style={pdfStyles.page}>
              <Text style={pdfStyles.title}>Project Financial Report - {reports.projectName ?? 'Project'}</Text>
              <View style={pdfStyles.row}><Text>Total Contract</Text><Text>{inr.format(overview.totalContractAmount)}</Text></View>
              <View style={pdfStyles.row}><Text>Estimated</Text><Text>{inr.format(overview.totalEstimatedSoFar)}</Text></View>
              <View style={pdfStyles.row}><Text>Actual</Text><Text>{inr.format(overview.totalActualSpent)}</Text></View>
              <View style={pdfStyles.row}><Text>Variance</Text><Text>{inr.format(overview.variance)}</Text></View>
              <Text style={{ marginTop: 8, fontSize: 13 }}>Stage Payment Table</Text>
              <View style={pdfStyles.tableHeader}><Text style={pdfStyles.cell}>Stage</Text><Text style={pdfStyles.cell}>Expected</Text><Text style={pdfStyles.cell}>Actual</Text></View>
              {(reports.stagePayments ?? []).map((row) => (
                <View key={row.stage} style={pdfStyles.row}><Text>{row.label}</Text><Text>{inr.format(row.expectedAmount)}</Text><Text>{inr.format(row.actualPaidAmount)}</Text></View>
              ))}
              <Text style={{ marginTop: 8, fontSize: 13 }}>Confirmed Payments</Text>
              {(reports.confirmedPayments ?? []).map((row) => (
                <View key={row.id} style={pdfStyles.row}><Text>{row.paid_to_name} ({row.paid_to_category})</Text><Text>{inr.format(row.amount)}</Text></View>
              ))}
              <Text style={{ marginTop: 10, fontSize: 9 }}>Generated on {new Date().toLocaleString('en-IN')}</Text>
            </Page>
          </Document>
        }
      >
        {({ url, loading: pdfLoading }) => {
          if (exportRequested && url && !pdfLoading && !autoExportTriggered && typeof window !== 'undefined') {
            setAutoExportTriggered(true)
            window.setTimeout(() => {
              const anchor = document.createElement('a')
              anchor.href = url
              anchor.download = `financial-report-${projectId}.pdf`
              anchor.click()
            }, 50)
          }
          return (
            <a
              href={url ?? '#'}
              download={`financial-report-${projectId}.pdf`}
              className={`inline-flex h-10 items-center justify-center rounded-md bg-orange-500 px-4 text-sm font-semibold text-white ${pdfLoading ? 'opacity-60' : ''}`}
            >
              {pdfLoading ? 'Preparing PDF...' : 'Download PDF Report'}
            </a>
          )
        }}
      </BlobProvider>

      {showSetup ? (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <div className="absolute right-4 bottom-0 left-4 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Edit Financial Setup</h3>
              <button type="button" onClick={() => setShowSetup(false)} className="text-sm text-gray-500">Close</button>
            </div>
            <FinancialSetupForm
              projectId={projectId}
              defaultSchedule={setup?.defaultSchedule ?? []}
              existingFinancials={(setup?.financials ?? undefined) as never}
              onSuccess={() => {
                setShowSetup(false)
                void load()
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
