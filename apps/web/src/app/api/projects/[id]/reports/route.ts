import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Enums } from '@/types/supabase'

type ScheduleItem = {
  stage: string
  label: string
  percentage: number
}

type StageStatus = 'paid' | 'partial' | 'due' | 'upcoming'

const STAGE_ORDER: Array<Enums<'construction_stage'>> = [
  'foundation',
  'plinth',
  'walls',
  'slab',
  'plastering',
  'finishing',
]

const STAGE_PROGRESS: Record<Enums<'construction_stage'>, number> = {
  foundation: 10,
  plinth: 20,
  walls: 40,
  slab: 55,
  plastering: 75,
  finishing: 95,
}

function mapScheduleToStage(stage: string): Enums<'construction_stage'> {
  if (stage === 'advance') return 'foundation'
  if (stage.includes('plinth')) return 'plinth'
  if (stage.includes('brick') || stage.includes('wood')) return 'walls'
  if (stage.includes('lintel') || stage.includes('roof') || stage.includes('rcc')) return 'slab'
  if (stage.includes('plaster')) return 'plastering'
  return 'finishing'
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  const dayAdjust = to.getDate() >= from.getDate() ? 0 : -1
  return Math.max(0, months + dayAdjust)
}

async function hasAccess(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return false
  if (project.customer_id === userId || project.contractor_id === userId) return true
  const { data: member } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(member)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const allowed = await hasAccess(projectId, user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [financialsRes, paymentsRes, projectRes, materialRes] = await Promise.all([
    supabase.from('project_financials').select('*').eq('project_id', projectId).maybeSingle(),
    supabase
      .from('payments')
      .select('id,amount,paid_to,paid_to_category,payment_mode,status,paid_at,recorded_by,description')
      .eq('project_id', projectId)
      .eq('status', 'confirmed')
      .order('paid_at', { ascending: true }),
    supabase.from('projects').select('name,current_stage,start_date,expected_end_date').eq('id', projectId).maybeSingle(),
    supabase
      .from('material_price_updates')
      .select('cement_rate,steel_rate,recorded_at')
      .eq('project_id', projectId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (financialsRes.error || paymentsRes.error || projectRes.error || materialRes.error) {
    return NextResponse.json(
      {
        error:
          financialsRes.error?.message ??
          paymentsRes.error?.message ??
          projectRes.error?.message ??
          materialRes.error?.message ??
          'Failed to load reports',
      },
      { status: 400 }
    )
  }

  const financials = financialsRes.data
  const confirmedPayments = paymentsRes.data ?? []
  const project = projectRes.data
  const latestMaterial = materialRes.data

  if (!financials || !project) return NextResponse.json({ hasFinancialSetup: false })

  const schedule = Array.isArray(financials.payment_schedule)
    ? (financials.payment_schedule as unknown as ScheduleItem[])
    : []

  const totalContractAmount = Number(financials.total_contract_amount ?? 0)
  const totalActualSpent = confirmedPayments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const currentStage = project.current_stage as Enums<'construction_stage'>
  const currentStageProgress = STAGE_PROGRESS[currentStage] ?? 0

  const chartEstimated: Array<{
    stage: string
    label: string
    amount: number
    cumulative: number
  }> = []
  const chartActual: Array<{
    stage: string
    label: string
    amount: number
    cumulative: number
  }> = []
  const stagePayments: Array<{
    stage: string
    label: string
    expectedAmount: number
    actualPaidAmount: number
    status: StageStatus
  }> = []

  const actualByPaymentStage = confirmedPayments.reduce<Record<string, number>>((acc, payment) => {
    const description = String(payment.description ?? '')
    const stageMatch = description.match(/\[STAGE:([a-z_]+)\]/i)
    const stage = stageMatch?.[1]?.toLowerCase()
    if (!stage) return acc
    acc[stage] = (acc[stage] ?? 0) + Number(payment.amount ?? 0)
    return acc
  }, {})

  let estimatedCumulative = 0
  let actualCumulative = 0

  for (const item of schedule) {
    const expectedAmount = (Number(item.percentage) / 100) * totalContractAmount
    estimatedCumulative += expectedAmount
    const stageActual = actualByPaymentStage[item.stage] ?? 0

    actualCumulative += stageActual
    const mappedStage = mapScheduleToStage(item.stage)
    const stageReached = (STAGE_PROGRESS[mappedStage] ?? 0) <= currentStageProgress
    let status: StageStatus = 'upcoming'
    if (stageActual >= expectedAmount) status = 'paid'
    else if (stageActual > 0) status = 'partial'
    else if (stageReached) status = 'due'

    stagePayments.push({
      stage: item.stage,
      label: item.label,
      expectedAmount,
      actualPaidAmount: stageActual,
      status,
    })

    chartEstimated.push({
      stage: item.stage,
      label: item.label,
      amount: expectedAmount,
      cumulative: estimatedCumulative,
    })
    chartActual.push({
      stage: item.stage,
      label: item.label,
      amount: stageActual,
      cumulative: actualCumulative,
    })
  }

  const totalEstimatedSoFar = stagePayments
    .filter((item) => (STAGE_PROGRESS[mapScheduleToStage(item.stage)] ?? 0) <= currentStageProgress)
    .reduce((sum, item) => sum + item.expectedAmount, 0)

  const variance = totalEstimatedSoFar - totalActualSpent
  const varianceLabel = variance >= 0 ? 'under budget' : 'over budget'

  const startDate = financials.start_date ?? project.start_date
  const expectedEndDate = financials.expected_end_date ?? project.expected_end_date ?? startDate
  const todayIso = new Date().toISOString().slice(0, 10)
  const monthsElapsed = monthsBetween(startDate, todayIso)
  const totalMonths = Math.max(1, monthsBetween(startDate, expectedEndDate))
  const progressPercent = Math.min(100, (monthsElapsed / totalMonths) * 100)
  const isDelayed = currentStageProgress < progressPercent

  const threshold = Number(financials.escalation_threshold_percent ?? 10)
  const cementAgreed = Number(financials.agreed_cement_rate ?? 400)
  const steelAgreed = Number(financials.agreed_steel_rate ?? 65)
  const cementCurrent = Number(latestMaterial?.cement_rate ?? cementAgreed)
  const steelCurrent = Number(latestMaterial?.steel_rate ?? steelAgreed)
  const alerts = [
    {
      material: 'Cement',
      agreedRate: cementAgreed,
      currentRate: cementCurrent,
    },
    {
      material: 'Steel',
      agreedRate: steelAgreed,
      currentRate: steelCurrent,
    },
  ].map((item) => {
    const increasePercent = item.agreedRate > 0 ? ((item.currentRate - item.agreedRate) / item.agreedRate) * 100 : 0
    const isAboveThreshold = increasePercent > threshold
    const estimatedExtraCost = isAboveThreshold
      ? ((item.currentRate - item.agreedRate) / Math.max(1, item.agreedRate)) * totalContractAmount * 0.08
      : 0
    return {
      ...item,
      increasePercent,
      isAboveThreshold,
      estimatedExtraCost,
    }
  })

  const userIds = Array.from(new Set(confirmedPayments.map((p) => p.paid_to)))
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: paidToUsers } = userIds.length
    ? await admin.from('users').select('id,name').in('id', userIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const userById = new Map((paidToUsers ?? []).map((entry) => [entry.id, entry.name]))

  return NextResponse.json({
    hasFinancialSetup: true,
    overview: {
      totalContractAmount,
      totalEstimatedSoFar,
      totalActualSpent,
      variance,
      varianceLabel,
      percentComplete: currentStageProgress,
      monthsElapsed,
      totalMonths,
    },
    stagePayments,
    chartData: { estimated: chartEstimated, actual: chartActual },
    escalationAlerts: alerts,
    timeline: {
      startDate,
      expectedEndDate,
      currentStage,
      monthsElapsed,
      totalMonths,
      isDelayed,
      progressPercent,
    },
    categoryBudget: (financials.category_budget as Record<string, number> | null) ?? null,
    confirmedPayments: confirmedPayments.map((row) => ({
      id: row.id,
      amount: Number(row.amount ?? 0),
      paid_at: row.paid_at,
      paid_to_category: row.paid_to_category,
      payment_mode: row.payment_mode,
      paid_to_name: userById.get(row.paid_to) ?? 'User',
      description: row.description ?? '',
    })),
    projectName: project.name,
  })
}
