'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const BRAND = '#D85A30'
const RED = '#DC2626'
const BLUE = '#3B82F6'

type UserProfile = {
  id: string
  name: string
  role: string
  city: string
}

type Project = {
  id: string
  name: string
  address: string
  city: string
  status: string
  current_stage: string
  customer_id: string
  contractor_id: string | null
  updated_at: string
}

type SparkPoint = { amount: number; date: string }

type ActivityItem = {
  id: string
  projectId: string
  type: 'update' | 'payment' | 'chat' | 'invitation'
  title: string
  subtitle: string
  date: string
  projectName: string
  status?: string
}

type SitePhoto = {
  projectId: string
  projectName: string
  photoUrl: string
  stageTag: string
  date: string
}

type PendingPayment = {
  id: string
  projectId: string
  projectName: string
  amount: number
  category: string
}

type PendingInvitation = {
  id: string
  projectId: string
  projectName: string
  customerName: string
  role: 'contractor' | 'worker'
}

type UpdateDue = {
  projectId: string
  projectName: string
  daysSince: number
}

type TooltipState = {
  index: number
  x: number
  y: number
  amount: number
  date: string
} | null

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '0 days ago'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function paymentDeclined(status: string): boolean {
  return status === 'declined' || status === 'rejected'
}

const STAGE_PROGRESS: Record<string, number> = {
  foundation: 10,
  plinth: 25,
  walls: 45,
  slab: 60,
  plastering: 80,
  finishing: 100,
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string; border: string }
> = {
  pending: {
    bg: '#FEF3C7',
    text: '#92400E',
    label: 'Awaiting Contractor',
    border: '#F59E0B',
  },
  on_hold: {
    bg: '#FEF3C7',
    text: '#92400E',
    label: 'Awaiting Contractor',
    border: '#F59E0B',
  },
  active: {
    bg: '#D1FAE5',
    text: '#065F46',
    label: 'In Progress',
    border: '#10B981',
  },
  completed: {
    bg: '#F3F4F6',
    text: '#374151',
    label: 'Completed',
    border: '#9CA3AF',
  },
  cancelled: {
    bg: '#FEE2E2',
    text: '#991B1B',
    label: 'Cancelled',
    border: '#EF4444',
  },
}

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  foundation: { bg: '#F1F5F9', text: '#475569' },
  plinth: { bg: '#EFF6FF', text: '#1D4ED8' },
  walls: { bg: '#FFFBEB', text: '#92400E' },
  slab: { bg: '#FFF7ED', text: '#C2410C' },
  plastering: { bg: '#FAF5FF', text: '#6D28D9' },
  finishing: { bg: '#ECFDF5', text: '#065F46' },
}

function daysAgoLabel(dateValue?: string): string {
  if (!dateValue) return 'No updates yet'
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

function awaitingLabel(project: { contractor_id: string | null }): string {
  return project.contractor_id ? 'Waiting contractor approval' : 'Waiting worker approval'
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const payload = (await res.json()) as { error?: string } & Record<string, unknown>
  if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status})`)
  return payload as T
}

function DashboardSparkline({
  points,
  color,
  chartWidth,
  height = 56,
}: {
  points: SparkPoint[]
  color: string
  chartWidth: number
  height?: number
}) {
  const reactId = useId().replace(/:/g, '')
  const gradId = `spark_${reactId}_${color.replace(/#/g, '')}`
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  if (chartWidth < 16 || points.length < 2) {
    return (
      <div className="flex items-center justify-center text-[10px] italic text-white/30" style={{ height }}>
        No payment data yet
      </div>
    )
  }

  const PAD_L = 4
  const PAD_R = 4
  const PAD_T = 16
  const PAD_B = 4
  const plotW = chartWidth - PAD_L - PAD_R
  const plotH = height - PAD_T - PAD_B
  const maxVal = Math.max(...points.map((p) => p.amount), 1)
  const n = points.length

  const getX = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const getY = (v: number) => PAD_T + plotH - (v / maxVal) * plotH

  const areaPath =
    `M${getX(0)},${PAD_T + plotH} ` +
    points.map((p, i) => `L${getX(i)},${getY(p.amount)}`).join(' ') +
    ` L${getX(n - 1)},${PAD_T + plotH} Z`

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    })

  const handleDotPress = (i: number, point: SparkPoint) => {
    const x = getX(i)
    const y = getY(point.amount)
    if (tooltip?.index === i) setTooltip(null)
    else setTooltip({ index: i, x, y, amount: point.amount, date: point.date })
  }

  const TW = 100
  const TH = 34

  return (
    <div>
      <svg width={chartWidth} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={`M ${points.map((p, i) => `${getX(i)},${getY(p.amount)}`).join(' L ')}`}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={tooltip ? 0.4 : 1}
        />
        {points.map((p, i) => {
          const isActive = tooltip?.index === i
          return (
            <circle
              key={`${p.date}-${i}`}
              cx={getX(i)}
              cy={getY(p.amount)}
              r={isActive ? 5 : 3}
              fill={isActive ? color : 'rgba(255,255,255,0.4)'}
              stroke={color}
              strokeWidth={isActive ? 2 : 1}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => handleDotPress(i, p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleDotPress(i, p)
                }
              }}
            />
          )
        })}
        {tooltip ? (() => {
          const tx = Math.max(0, Math.min(tooltip.x - TW / 2, chartWidth - TW))
          const ty = Math.max(0, tooltip.y - TH - 8)
          return (
            <g>
              <path
                d={`M${tx},${ty} h${TW} a4,4 0 0 1 4,4 v${TH - 8} a4,4 0 0 1 -4,4 h-${TW} a4,4 0 0 1 -4,-4 v-${TH - 8} a4,4 0 0 1 4,-4 z`}
                fill="rgba(44,44,42,0.95)"
              />
              <text x={tx + TW / 2} y={ty + 14} fontSize={10} fontWeight={800} fill={color} textAnchor="middle">
                ₹{tooltip.amount.toLocaleString('en-IN')}
              </text>
              <text
                x={tx + TW / 2}
                y={ty + 27}
                fontSize={8}
                fill="rgba(255,255,255,0.7)"
                textAnchor="middle"
              >
                {formatDate(tooltip.date)}
              </text>
            </g>
          )
        })() : null}
      </svg>
      <p className="mt-0.5 text-right text-[8px] italic text-white/25">Tap dots to see values</p>
    </div>
  )
}

function ActivityDot({ type, status }: { type: ActivityItem['type']; status?: string }) {
  const color =
    type === 'payment'
      ? status === 'confirmed'
        ? '#10B981'
        : paymentDeclined(status ?? '')
          ? '#DC2626'
          : '#F59E0B'
      : type === 'update'
        ? '#D85A30'
        : type === 'invitation'
          ? '#8B5CF6'
          : BLUE

  return (
    <span
      className="mt-0.5 inline-block h-[9px] w-[9px] shrink-0 rounded-[5px]"
      style={{ backgroundColor: color }}
    />
  )
}

type DashboardHomeProps = {
  initialProfile: UserProfile
}

export default function DashboardHome({ initialProfile }: DashboardHomeProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(320)

  const [profile, setProfile] = useState<UserProfile | null>(initialProfile)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectHasAcceptedProfessional, setProjectHasAcceptedProfessional] = useState<Map<string, boolean>>(new Map())
  const [workerProjectSet, setWorkerProjectSet] = useState<Set<string>>(new Set())
  const [latestUpdateByProject, setLatestUpdateByProject] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [sparkPoints, setSparkPoints] = useState<SparkPoint[]>([])
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([])
  const [sitePhotos, setSitePhotos] = useState<SitePhoto[]>([])
  const [totalPaid, setTotalPaid] = useState(0)
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([])
  const [updatesDue, setUpdatesDue] = useState<UpdateDue[]>([])
  const [newUpdatesCount, setNewUpdatesCount] = useState(0)
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0)
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [actioningPaymentId, setActioningPaymentId] = useState<string | null>(null)
  const [actioningInviteId, setActioningInviteId] = useState<string | null>(null)

  const paymentChannelSuffix = useId().replace(/:/g, '')
  const enquiryChannelSuffix = useId().replace(/:/g, '')

  useEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setChartWidth(Math.max(120, el.clientWidth)))
    ro.observe(el)
    setChartWidth(Math.max(120, el.clientWidth))
    return () => ro.disconnect()
  }, [loading])

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }

    setSparkPoints([])
    setActivityFeed([])
    setSitePhotos([])
    setTotalPaid(0)
    setPendingPayments([])
    setUpdatesDue([])
    setNewUpdatesCount(0)
    setPendingInvitesCount(0)
    setPendingInvitations([])
    setWorkerProjectSet(new Set())
    setLatestUpdateByProject(new Map())

    const { data: prof } = await supabase.from('users').select('id, name, role, city').eq('id', user.id).maybeSingle()

    if (!prof) {
      router.replace('/register')
      return
    }
    setProfile(prof)

    let approvedProjects: Project[] = []
    let contractorProjects: Project[] = []
    let workerProjects: Project[] = []

    const hydrateProjectListExtras = async (projectIds: string[]) => {
      if (projectIds.length === 0) {
        setWorkerProjectSet(new Set())
        setLatestUpdateByProject(new Map())
        return
      }
      const { data: workerMembers } = await supabase
        .from('project_members')
        .select('project_id')
        .in('project_id', projectIds)
        .eq('role', 'worker')
      setWorkerProjectSet(new Set((workerMembers ?? []).map((m) => m.project_id)))

      const { data: updateRows } = await supabase
        .from('daily_updates')
        .select('project_id,created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
      const latestMap = new Map<string, string>()
      for (const row of updateRows ?? []) {
        if (!latestMap.has(row.project_id)) latestMap.set(row.project_id, row.created_at as string)
      }
      setLatestUpdateByProject(latestMap)
    }

    if (prof.role === 'customer') {
      const { data: owned } = await supabase
        .from('projects')
        .select('id, name, address, city, status, current_stage, customer_id, contractor_id, updated_at')
        .eq('customer_id', user.id)
        .order('updated_at', { ascending: false })
      const ownedProjects = (owned ?? []) as Project[]
      const projectIds = ownedProjects.map((p) => p.id)
      approvedProjects = ownedProjects
      if (projectIds.length > 0) {
        const { data: members } = await supabase.from('project_members').select('project_id,user_id,role').in('project_id', projectIds)
        const memberRows = (members ?? []) as Array<{ project_id: string; user_id: string; role: string | null }>
        const acceptedProfessionalMap = new Map<string, boolean>()
        for (const member of memberRows) {
          if (member.user_id !== user.id && (member.role === 'worker' || member.role === 'contractor')) {
            acceptedProfessionalMap.set(member.project_id, true)
          }
        }
        setProjectHasAcceptedProfessional(acceptedProfessionalMap)
        approvedProjects = ownedProjects.filter((project) => {
          if (project.contractor_id) {
            return memberRows.some((m) => m.project_id === project.id && m.user_id === project.contractor_id)
          }
          return memberRows.some((m) => m.project_id === project.id && m.role === 'worker')
        })
      }
      setProjects(approvedProjects)
      const approvedIds = approvedProjects.map((p) => p.id)
      if (approvedIds.length === 0) {
        setProjectHasAcceptedProfessional(new Map())
      }

      const ids = approvedProjects.map((p) => p.id)

      if (ids.length > 0) {
        const { data: paySpark } = await supabase
          .from('payments')
          .select('amount,paid_at,status')
          .in('project_id', ids)
          .eq('status', 'confirmed')
          .order('paid_at', { ascending: true })
          .limit(20)
        const pts = (paySpark ?? []).map((r) => ({
          amount: Number(r.amount),
          date: r.paid_at as string,
        }))
        setSparkPoints(pts)

        const { data: payTotals } = await supabase.from('payments').select('amount').in('project_id', ids).eq('status', 'confirmed')
        setTotalPaid((payTotals ?? []).reduce((s, r) => s + Number(r.amount), 0))

        const { data: custPending } = await supabase
          .from('payments')
          .select('id,amount,paid_to_category,project_id')
          .in('project_id', ids)
          .eq('status', 'pending_confirmation')
          .order('created_at', { ascending: false })
        const pendIds = Array.from(new Set((custPending ?? []).map((p) => p.project_id)))
        const { data: pendProjs } = pendIds.length
          ? await supabase.from('projects').select('id,name').in('id', pendIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const pendMap = new Map((pendProjs ?? []).map((p) => [p.id, p.name]))
        setPendingPayments(
          (custPending ?? []).map((p) => ({
            id: p.id,
            projectId: p.project_id,
            projectName: pendMap.get(p.project_id) ?? 'Project',
            amount: Number(p.amount),
            category: String(p.paid_to_category ?? 'contractor_fee'),
          }))
        )

        const photos: SitePhoto[] = []
        for (const pid of ids.slice(0, 4)) {
          const proj = approvedProjects.find((p) => p.id === pid)
          const { data: upd } = await supabase
            .from('daily_updates')
            .select('photo_urls,stage_tag,created_at')
            .eq('project_id', pid)
            .order('created_at', { ascending: false })
            .limit(8)
          const first = (upd ?? []).find((u) => Array.isArray(u.photo_urls) && u.photo_urls.length > 0)
          const urls = first?.photo_urls as unknown as string[] | undefined
          if (first && urls?.[0]) {
            photos.push({
              projectId: pid,
              projectName: proj?.name ?? 'Project',
              photoUrl: urls[0],
              stageTag: String(first.stage_tag ?? 'foundation'),
              date: first.created_at as string,
            })
          }
        }
        setSitePhotos(photos)

        const feed: ActivityItem[] = []

        const { data: recentPayments } = await supabase
          .from('payments')
          .select('id,amount,status,paid_at,project_id')
          .in('project_id', ids)
          .order('paid_at', { ascending: false })
          .limit(5)
        const payProjectIds = Array.from(new Set((recentPayments ?? []).map((p) => p.project_id)))
        const { data: payProjects } = payProjectIds.length
          ? await supabase.from('projects').select('id,name').in('id', payProjectIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const payProjName = new Map((payProjects ?? []).map((p) => [p.id, p.name]))
        for (const pay of recentPayments ?? []) {
          const st = pay.status as string
          feed.push({
            id: `pay-${pay.id}`,
            projectId: pay.project_id,
            type: 'payment',
            title:
              st === 'confirmed'
                ? `✓ ₹${Number(pay.amount).toLocaleString('en-IN')} confirmed`
                : paymentDeclined(st)
                  ? `✕ ₹${Number(pay.amount).toLocaleString('en-IN')} declined`
                  : `💰 ₹${Number(pay.amount).toLocaleString('en-IN')} pending`,
            subtitle:
              st === 'confirmed' ? 'Payment approved' : paymentDeclined(st) ? 'Payment declined' : 'Waiting contractor approval',
            date: pay.paid_at as string,
            projectName: payProjName.get(pay.project_id) ?? 'Project',
            status: st,
          })
        }

        const { data: recentUpdates } = await supabase
          .from('daily_updates')
          .select('id,description,stage_tag,created_at,project_id')
          .in('project_id', ids)
          .order('created_at', { ascending: false })
          .limit(5)
        const updProjectIds = Array.from(new Set((recentUpdates ?? []).map((u) => u.project_id)))
        const { data: updProjects } = updProjectIds.length
          ? await supabase.from('projects').select('id,name').in('id', updProjectIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const updProjName = new Map((updProjects ?? []).map((p) => [p.id, p.name]))
        for (const upd of recentUpdates ?? []) {
          feed.push({
            id: `upd-${upd.id}`,
            projectId: upd.project_id,
            type: 'update',
            title: `📸 Site update — ${upd.stage_tag ?? 'update'}`,
            subtitle: upd.description ? `"${upd.description.slice(0, 50)}"` : 'New site update posted',
            date: upd.created_at as string,
            projectName: updProjName.get(upd.project_id) ?? 'Project',
          })
        }

        feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setActivityFeed(feed.slice(0, 8))

        const cutoff = Date.now() - 7 * 86400000
        setNewUpdatesCount((recentUpdates ?? []).filter((u) => new Date(u.created_at).getTime() > cutoff).length)

        const { count: inviteCount } = await supabase
          .from('enquiries')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', user.id)
          .eq('status', 'open')
          .ilike('subject', '%Project invitation%')
        setPendingInvitesCount(inviteCount ?? 0)
      }
      await hydrateProjectListExtras(approvedProjects.map((p) => p.id))
    } else if (prof.role === 'contractor') {
      const { data: proj } = await supabase
        .from('projects')
        .select('id, name, address, city, status, current_stage, customer_id, contractor_id, updated_at')
        .eq('contractor_id', user.id)
        .in('status', ['active', 'completed'])
        .order('updated_at', { ascending: false })
      contractorProjects = (proj ?? []) as Project[]
      setProjects(contractorProjects)
      const ids = contractorProjects.map((p) => p.id)
      if (ids.length > 0) {
        setProjectHasAcceptedProfessional(new Map(ids.map((projectId) => [projectId, true])))
      } else {
        setProjectHasAcceptedProfessional(new Map())
      }

      const myProjectIds = contractorProjects.map((p) => p.id)

      if (myProjectIds.length > 0) {
        const { data: earnRows } = await supabase
          .from('payments')
          .select('amount,paid_at')
          .in('project_id', myProjectIds)
          .eq('paid_to', user.id)
          .eq('status', 'confirmed')
          .order('paid_at', { ascending: true })
          .limit(20)
        const pts = (earnRows ?? []).map((r) => ({
          amount: Number(r.amount),
          date: r.paid_at as string,
        }))
        setSparkPoints(pts)

        const { data: earnTotals } = await supabase
          .from('payments')
          .select('amount')
          .in('project_id', myProjectIds)
          .eq('paid_to', user.id)
          .eq('status', 'confirmed')
        setTotalPaid((earnTotals ?? []).reduce((s, r) => s + Number(r.amount), 0))

        const { data: pendPay } = await supabase
          .from('payments')
          .select('id,amount,paid_to_category,project_id')
          .in('project_id', myProjectIds)
          .eq('paid_to', user.id)
          .eq('status', 'pending_confirmation')
          .order('created_at', { ascending: false })
        const pendProjectIds = Array.from(new Set((pendPay ?? []).map((p) => p.project_id)))
        const { data: pendProjs } = pendProjectIds.length
          ? await supabase.from('projects').select('id,name').in('id', pendProjectIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const pendProjName = new Map((pendProjs ?? []).map((p) => [p.id, p.name]))
        setPendingPayments(
          (pendPay ?? []).map((p) => ({
            id: p.id,
            projectId: p.project_id,
            projectName: pendProjName.get(p.project_id) ?? 'Project',
            amount: Number(p.amount),
            category: String(p.paid_to_category ?? 'contractor_fee'),
          }))
        )

        const due: UpdateDue[] = []
        for (const pid of myProjectIds.slice(0, 5)) {
          const proj = contractorProjects.find((p) => p.id === pid) ?? { name: 'Project' }
          const { data: lastUpd } = await supabase
            .from('daily_updates')
            .select('created_at')
            .eq('project_id', pid)
            .order('created_at', { ascending: false })
            .limit(1)
          const last = lastUpd?.[0]
          const daysSince = last ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) : 999
          due.push({
            projectId: pid,
            projectName: proj.name,
            daysSince,
          })
        }
        due.sort((a, b) => b.daysSince - a.daysSince)
        setUpdatesDue(due)

        const feed: ActivityItem[] = []
        const { data: contPayments } = await supabase
          .from('payments')
          .select('id,amount,status,paid_at,project_id')
          .in('project_id', myProjectIds)
          .eq('paid_to', user.id)
          .order('paid_at', { ascending: false })
          .limit(5)
        const cpIds = Array.from(new Set((contPayments ?? []).map((p) => p.project_id)))
        const { data: cpProjs } = cpIds.length
          ? await supabase.from('projects').select('id,name').in('id', cpIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const cpProjName = new Map((cpProjs ?? []).map((p) => [p.id, p.name]))
        for (const pay of contPayments ?? []) {
          const st = pay.status as string
          feed.push({
            id: `pay-${pay.id}`,
            projectId: pay.project_id,
            type: 'payment',
            title:
              st === 'pending_confirmation'
                ? `💰 ₹${Number(pay.amount).toLocaleString('en-IN')} needs approval`
                : st === 'confirmed'
                  ? `✓ ₹${Number(pay.amount).toLocaleString('en-IN')} confirmed`
                  : `₹${Number(pay.amount).toLocaleString('en-IN')} declined`,
            subtitle:
              st === 'pending_confirmation'
                ? 'Customer logged · tap to review'
                : st === 'confirmed'
                  ? 'Payment confirmed'
                  : 'Payment declined',
            date: pay.paid_at as string,
            projectName: cpProjName.get(pay.project_id) ?? 'Project',
            status: st,
          })
        }

        const { data: contUpdates } = await supabase
          .from('daily_updates')
          .select('id,description,stage_tag,created_at,project_id')
          .in('project_id', myProjectIds)
          .order('created_at', { ascending: false })
          .limit(5)
        const cuIds = Array.from(new Set((contUpdates ?? []).map((u) => u.project_id)))
        const { data: cuProjs } = cuIds.length
          ? await supabase.from('projects').select('id,name').in('id', cuIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const cuProjName = new Map((cuProjs ?? []).map((p) => [p.id, p.name]))
        for (const upd of contUpdates ?? []) {
          feed.push({
            id: `upd-${upd.id}`,
            projectId: upd.project_id,
            type: 'update',
            title: `📸 Update posted — ${upd.stage_tag ?? ''}`,
            subtitle: upd.description ? `"${upd.description.slice(0, 50)}"` : 'Site update',
            date: upd.created_at as string,
            projectName: cuProjName.get(upd.project_id) ?? 'Project',
          })
        }

        feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setActivityFeed(feed.slice(0, 8))
      }

      const { data: contractInviteRows } = await supabase
        .from('enquiries')
        .select('id,subject,customer_id,status')
        .eq('recipient_id', user.id)
        .eq('status', 'open')
        .ilike('subject', 'Project invitation [%')
        .order('created_at', { ascending: false })
        .limit(5)

      if ((contractInviteRows ?? []).length > 0) {
        const parsedInvites = (contractInviteRows ?? [])
          .map((row) => {
            const match = row.subject.match(/\[([0-9a-fA-F-]{36})\]:\s*(.+)$/)
            return {
              id: row.id,
              projectId: match?.[1] ?? '',
              projectName: match?.[2] ?? 'Project',
              customerId: row.customer_id as string,
            }
          })
          .filter((i) => i.projectId !== '')

        if (parsedInvites.length > 0) {
          const customerIds = Array.from(new Set(parsedInvites.map((i) => i.customerId)))
          const { data: customerUsers } = customerIds.length
            ? await supabase.from('users').select('id,name,role').in('id', customerIds)
            : { data: [] as Array<{ id: string; name: string; role: string }> }
          const customerNameById = new Map((customerUsers ?? []).map((u) => [u.id, u.name]))

          setPendingInvitations(
            parsedInvites.map((inv) => ({
              id: inv.id,
              projectId: inv.projectId,
              projectName: inv.projectName,
              customerName: customerNameById.get(inv.customerId) ?? 'Customer',
              role: 'contractor',
            }))
          )
        } else {
          setPendingInvitations([])
        }
      } else {
        setPendingInvitations([])
      }
      await hydrateProjectListExtras(contractorProjects.map((p) => p.id))
    } else {
      const { data: mem } = await supabase.from('project_members').select('project_id').eq('user_id', user.id)
      const ids = Array.from(new Set((mem ?? []).map((m) => m.project_id)))
      if (ids.length) {
        const { data: proj } = await supabase
          .from('projects')
          .select('id, name, address, city, status, current_stage, customer_id, contractor_id, updated_at')
          .in('id', ids)
          .order('updated_at', { ascending: false })
        workerProjects = (proj ?? []) as Project[]
        setProjects(workerProjects)
        const workerProjectIds = workerProjects.map((p) => p.id)
        setProjectHasAcceptedProfessional(new Map(workerProjectIds.map((projectId) => [projectId, true])))
      } else {
        setProjects([])
        setProjectHasAcceptedProfessional(new Map())
      }

      const myProjectIds = workerProjects.map((p) => p.id)

      if (myProjectIds.length > 0) {
        const { data: earnRows } = await supabase
          .from('payments')
          .select('amount,paid_at')
          .in('project_id', myProjectIds)
          .eq('paid_to', user.id)
          .eq('status', 'confirmed')
          .order('paid_at', { ascending: true })
          .limit(20)
        const pts = (earnRows ?? []).map((r) => ({
          amount: Number(r.amount),
          date: r.paid_at as string,
        }))
        setSparkPoints(pts)

        const { data: earnTotals } = await supabase
          .from('payments')
          .select('amount')
          .in('project_id', myProjectIds)
          .eq('paid_to', user.id)
          .eq('status', 'confirmed')
        setTotalPaid((earnTotals ?? []).reduce((s, r) => s + Number(r.amount), 0))

        const { data: pendPay } = await supabase
          .from('payments')
          .select('id,amount,paid_to_category,project_id')
          .in('project_id', myProjectIds)
          .eq('paid_to', user.id)
          .eq('status', 'pending_confirmation')
          .order('created_at', { ascending: false })
        const pendProjectIds = Array.from(new Set((pendPay ?? []).map((p) => p.project_id)))
        const { data: pendProjs } = pendProjectIds.length
          ? await supabase.from('projects').select('id,name').in('id', pendProjectIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const pendProjName = new Map((pendProjs ?? []).map((p) => [p.id, p.name]))
        setPendingPayments(
          (pendPay ?? []).map((p) => ({
            id: p.id,
            projectId: p.project_id,
            projectName: pendProjName.get(p.project_id) ?? 'Project',
            amount: Number(p.amount),
            category: String(p.paid_to_category ?? 'contractor_fee'),
          }))
        )

        const due: UpdateDue[] = []
        for (const pid of myProjectIds.slice(0, 5)) {
          const proj = workerProjects.find((p) => p.id === pid) ?? { name: 'Project' }
          const { data: lastUpd } = await supabase
            .from('daily_updates')
            .select('created_at')
            .eq('project_id', pid)
            .order('created_at', { ascending: false })
            .limit(1)
          const last = lastUpd?.[0]
          const daysSince = last ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) : 999
          due.push({
            projectId: pid,
            projectName: proj.name,
            daysSince,
          })
        }
        due.sort((a, b) => b.daysSince - a.daysSince)
        setUpdatesDue(due)

        const feed: ActivityItem[] = []
        const { data: contPayments } = await supabase
          .from('payments')
          .select('id,amount,status,paid_at,project_id')
          .in('project_id', myProjectIds)
          .eq('paid_to', user.id)
          .order('paid_at', { ascending: false })
          .limit(5)
        const cpIds = Array.from(new Set((contPayments ?? []).map((p) => p.project_id)))
        const { data: cpProjs } = cpIds.length
          ? await supabase.from('projects').select('id,name').in('id', cpIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const cpProjName = new Map((cpProjs ?? []).map((p) => [p.id, p.name]))
        for (const pay of contPayments ?? []) {
          const st = pay.status as string
          feed.push({
            id: `pay-${pay.id}`,
            projectId: pay.project_id,
            type: 'payment',
            title:
              st === 'pending_confirmation'
                ? `💰 ₹${Number(pay.amount).toLocaleString('en-IN')} needs approval`
                : st === 'confirmed'
                  ? `✓ ₹${Number(pay.amount).toLocaleString('en-IN')} confirmed`
                  : `₹${Number(pay.amount).toLocaleString('en-IN')} declined`,
            subtitle:
              st === 'pending_confirmation'
                ? 'Customer logged · tap to review'
                : st === 'confirmed'
                  ? 'Payment confirmed'
                  : 'Payment declined',
            date: pay.paid_at as string,
            projectName: cpProjName.get(pay.project_id) ?? 'Project',
            status: st,
          })
        }

        const { data: contUpdates } = await supabase
          .from('daily_updates')
          .select('id,description,stage_tag,created_at,project_id')
          .in('project_id', myProjectIds)
          .order('created_at', { ascending: false })
          .limit(5)
        const cuIds = Array.from(new Set((contUpdates ?? []).map((u) => u.project_id)))
        const { data: cuProjs } = cuIds.length
          ? await supabase.from('projects').select('id,name').in('id', cuIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const cuProjName = new Map((cuProjs ?? []).map((p) => [p.id, p.name]))
        for (const upd of contUpdates ?? []) {
          feed.push({
            id: `upd-${upd.id}`,
            projectId: upd.project_id,
            type: 'update',
            title: `📸 Update posted — ${upd.stage_tag ?? ''}`,
            subtitle: upd.description ? `"${upd.description.slice(0, 50)}"` : 'Site update',
            date: upd.created_at as string,
            projectName: cuProjName.get(upd.project_id) ?? 'Project',
          })
        }

        feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setActivityFeed(feed.slice(0, 8))
      }

      const { data: workerInviteRows } = await supabase
        .from('enquiries')
        .select('id,subject,customer_id,status')
        .eq('recipient_id', user.id)
        .eq('status', 'open')
        .ilike('subject', 'Project invitation [%')
        .order('created_at', { ascending: false })
        .limit(5)

      if ((workerInviteRows ?? []).length > 0) {
        const parsedInvites = (workerInviteRows ?? [])
          .map((row) => {
            const match = row.subject.match(/\[([0-9a-fA-F-]{36})\]:\s*(.+)$/)
            return {
              id: row.id,
              projectId: match?.[1] ?? '',
              projectName: match?.[2] ?? 'Project',
              customerId: row.customer_id as string,
            }
          })
          .filter((i) => i.projectId !== '')

        if (parsedInvites.length > 0) {
          const customerIds = Array.from(new Set(parsedInvites.map((i) => i.customerId)))
          const { data: customerUsers } = customerIds.length
            ? await supabase.from('users').select('id,name,role').in('id', customerIds)
            : { data: [] as Array<{ id: string; name: string; role: string }> }
          const customerNameById = new Map((customerUsers ?? []).map((u) => [u.id, u.name]))

          setPendingInvitations(
            parsedInvites.map((inv) => ({
              id: inv.id,
              projectId: inv.projectId,
              projectName: inv.projectName,
              customerName: customerNameById.get(inv.customerId) ?? 'Customer',
              role: 'worker',
            }))
          )
        } else {
          setPendingInvitations([])
        }
      } else {
        setPendingInvitations([])
      }
      await hydrateProjectListExtras(workerProjects.map((p) => p.id))
    }

    setLoading(false)
  }, [router, supabase])

  useEffect(() => {
    // Hydrates dashboard snapshot from Supabase (same pattern as mobile home tab).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadData resets snapshot then awaits Supabase
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!profile?.id || !profile.role) return
    const userId = profile.id
    const channelName = `dashboard-payments-${userId}-${paymentChannelSuffix}`
    const filter =
      profile.role === 'customer' ? `recorded_by=eq.${userId}` : `paid_to=eq.${userId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter,
        },
        () => {
          void loadData()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadData, paymentChannelSuffix, profile?.id, profile?.role, supabase])

  useEffect(() => {
    if (!profile?.id) return
    const userId = profile.id
    const channelName = `dashboard-enquiries-${userId}-${enquiryChannelSuffix}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'enquiries',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void loadData()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'enquiries',
          filter: `customer_id=eq.${userId}`,
        },
        () => {
          void loadData()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enquiryChannelSuffix, loadData, profile?.id, supabase])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  const handleApprovePayment = useCallback(
    async (pay: PendingPayment) => {
      try {
        setActioningPaymentId(pay.id)
        await postJson<{ success?: boolean }>(`/api/projects/${pay.projectId}/payments/respond`, {
          payment_id: pay.id,
          action: 'approve',
        })
        setPendingPayments((prev) => prev.filter((p) => p.id !== pay.id))
        void loadData()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to approve')
      } finally {
        setActioningPaymentId(null)
      }
    },
    [loadData]
  )

  const handleDeclinePayment = useCallback(
    async (pay: PendingPayment) => {
      if (
        !window.confirm(
          `Decline ₹${pay.amount.toLocaleString('en-IN')} for ${pay.projectName}?`
        )
      ) {
        return
      }
      try {
        setActioningPaymentId(pay.id)
        await postJson<{ success?: boolean }>(`/api/projects/${pay.projectId}/payments/respond`, {
          payment_id: pay.id,
          action: 'decline',
        })
        setPendingPayments((prev) => prev.filter((p) => p.id !== pay.id))
        void loadData()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to decline')
      } finally {
        setActioningPaymentId(null)
      }
    },
    [loadData]
  )

  const handleAcceptInvitation = useCallback(
    async (invite: PendingInvitation) => {
      try {
        setActioningInviteId(invite.id)
        await postJson<{ success?: boolean }>('/api/invitations/respond', {
          project_id: invite.projectId,
          action: 'accept',
        })
        setPendingInvitations((prev) => prev.filter((i) => i.id !== invite.id))
        toast.success(`You are now part of ${invite.projectName}`)
        void loadData()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to accept')
      } finally {
        setActioningInviteId(null)
      }
    },
    [loadData]
  )

  const handleDeclineInvitation = useCallback(
    async (invite: PendingInvitation) => {
      if (
        !window.confirm(
          `Decline project "${invite.projectName}" from ${invite.customerName}?`
        )
      ) {
        return
      }
      try {
        setActioningInviteId(invite.id)
        await postJson<{ success?: boolean }>('/api/invitations/respond', {
          project_id: invite.projectId,
          action: 'decline',
        })
        setPendingInvitations((prev) => prev.filter((i) => i.id !== invite.id))
        void loadData()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to decline')
      } finally {
        setActioningInviteId(null)
      }
    },
    [loadData]
  )

  if (loading || !profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#D85A30] border-t-transparent" aria-label="Loading" />
      </div>
    )
  }

  const activeCount = projects.filter((p) => {
    const effectiveStatus =
      (p.status === 'pending' || p.status === 'on_hold') && projectHasAcceptedProfessional.get(p.id) === true ? 'active' : p.status
    return effectiveStatus === 'active'
  }).length

  const pendingCount = projects.filter((p) => {
    const effectiveStatus =
      (p.status === 'pending' || p.status === 'on_hold') && projectHasAcceptedProfessional.get(p.id) === true ? 'active' : p.status
    return effectiveStatus === 'pending' || effectiveStatus === 'on_hold'
  }).length

  const isCustomer = profile.role === 'customer'

  const heroGradient = isCustomer ? 'linear-gradient(180deg,#2C2C2A,#2C2C2A)' : 'linear-gradient(180deg,#2C2C2A,#1A2A1A)'

  return (
    <div className="mx-auto w-full max-w-md px-4 py-4">
      <button
        type="button"
        onClick={() => void onRefresh()}
        disabled={refreshing}
        className="mb-2 text-xs font-semibold text-[#78716C] underline-offset-2 hover:underline disabled:opacity-50"
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>

      <section
        className="rounded-none px-4 pb-5 pt-3.5 text-white sm:rounded-2xl"
        style={{ background: heroGradient }}
      >
        <div className="mb-3.5 flex justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] text-white/45">{getGreeting()} 👋</p>
            <p className="text-[22px] font-extrabold tracking-tight">{profile.name.split(' ')[0]}</p>
            <span
              className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold capitalize"
              style={{ backgroundColor: 'rgba(216,90,48,0.3)', color: BRAND }}
            >
              {profile.role}
            </span>
          </div>
          <div className="text-right">
            <p className="mb-1 text-[9px] text-white/40">{isCustomer ? 'Total paid' : 'Total earned'}</p>
            <p className="text-xl font-extrabold" style={{ color: isCustomer ? BRAND : '#10B981' }}>
              ₹{totalPaid.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div ref={chartWrapRef} className="w-full">
          <DashboardSparkline
            points={sparkPoints}
            color={isCustomer ? BRAND : '#10B981'}
            chartWidth={chartWidth}
            height={56}
          />
          {sparkPoints.length >= 2 ? (
            <div className="mt-1 flex justify-between text-[8px]">
              <span className="text-white/30">
                {new Date(sparkPoints[0]!.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
              <span className="font-bold" style={{ color: isCustomer ? BRAND : '#10B981' }}>
                {new Date(sparkPoints[sparkPoints.length - 1]!.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                ↑
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-3.5 flex gap-2">
          <div className="flex flex-1 flex-col items-center rounded-xl bg-white/[0.08] px-2.5 py-2.5">
            <span className="text-xl font-extrabold">{activeCount}</span>
            <span className="mt-0.5 text-[8px] text-white/45">{isCustomer ? 'Active' : 'Projects'}</span>
            {isCustomer && pendingCount > 0 ? (
              <span className="mt-1 text-[7px] text-white/35">{pendingCount} awaiting</span>
            ) : null}
          </div>
          {isCustomer ? (
            <>
              <div className="flex flex-1 flex-col items-center rounded-xl bg-white/[0.08] px-2.5 py-2.5">
                <span className="text-xl font-extrabold text-blue-400">{newUpdatesCount}</span>
                <span className="mt-0.5 text-[8px] text-white/45">New updates</span>
              </div>
              <div className="flex flex-1 flex-col items-center rounded-xl bg-white/[0.08] px-2.5 py-2.5">
                <span className="text-xl font-extrabold text-violet-300">{pendingInvitesCount}</span>
                <span className="mt-0.5 text-[8px] text-white/45">Invitations</span>
              </div>
            </>
          ) : (
            <>
              <div
                className="flex flex-1 flex-col items-center rounded-xl px-2.5 py-2.5"
                style={{
                  backgroundColor: pendingPayments.length > 0 ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.08)',
                  borderWidth: pendingPayments.length > 0 ? 0.5 : 0,
                  borderColor: 'rgba(220,38,38,0.4)',
                }}
              >
                <span
                  className="text-xl font-extrabold"
                  style={{ color: pendingPayments.length > 0 ? '#F87171' : '#FFFFFF' }}
                >
                  {pendingPayments.length}
                </span>
                <span className="mt-0.5 text-[8px] text-white/45">Pay pending</span>
              </div>
              <div className="flex flex-1 flex-col items-center rounded-xl bg-white/[0.08] px-2.5 py-2.5">
                <span className="text-xl font-extrabold text-amber-300">★4.6</span>
                <span className="mt-0.5 text-[8px] text-white/45">Rating</span>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="mt-3 flex flex-col gap-3 pb-20">
        {isCustomer && pendingPayments.length > 0 ? (
          <section className="rounded-2xl border border-[#FDE68A] bg-[#FEF3C7] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[13px]">⏳</span>
              <span className="text-[10px] font-bold tracking-wide text-[#92400E]">
                {pendingPayments.length} PAYMENT{pendingPayments.length > 1 ? 'S' : ''} AWAITING CONTRACTOR
              </span>
            </div>
            {pendingPayments.slice(0, 2).map((pay) => (
              <Link
                key={pay.id}
                href={`/projects/${pay.projectId}?tab=payments`}
                className="mb-1.5 flex items-center justify-between rounded-[10px] bg-white p-2.5 last:mb-0"
              >
                <div>
                  <p className="text-[11px] font-bold text-[#2C2C2A]">{pay.projectName}</p>
                  <p className="mt-0.5 text-[9px] capitalize text-[#78716C]">{pay.category.replace(/_/g, ' ')}</p>
                </div>
                <p className="text-sm font-extrabold text-[#2C2C2A]">₹{pay.amount.toLocaleString('en-IN')}</p>
              </Link>
            ))}
          </section>
        ) : null}

        {!isCustomer && pendingPayments.length > 0 ? (
          <section className="rounded-2xl border border-[#FECACA] bg-[#FEE2E2] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[13px]">⚠️</span>
              <span className="text-[10px] font-bold tracking-wide text-[#DC2626]">
                {pendingPayments.length} PAYMENT{pendingPayments.length > 1 ? 'S' : ''} NEED YOUR APPROVAL
              </span>
            </div>
            {pendingPayments.slice(0, 2).map((pay) => (
              <div key={pay.id} className="mb-1.5 rounded-[10px] bg-white p-2.5 last:mb-0">
                <Link href={`/projects/${pay.projectId}?tab=payments`} className="block">
                  <div className="mb-1.5 flex justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold text-[#2C2C2A]">{pay.projectName}</p>
                      <p className="mt-0.5 text-[9px] capitalize text-[#78716C]">{pay.category.replace(/_/g, ' ')}</p>
                    </div>
                    <p className="text-sm font-extrabold text-[#2C2C2A]">₹{pay.amount.toLocaleString('en-IN')}</p>
                  </div>
                </Link>
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    disabled={actioningPaymentId === pay.id}
                    onClick={() => void handleApprovePayment(pay)}
                    className="flex flex-1 items-center justify-center rounded-lg py-2 text-[10px] font-bold text-white disabled:opacity-70"
                    style={{
                      backgroundColor: actioningPaymentId === pay.id ? '#A8A29E' : '#10B981',
                    }}
                  >
                    {actioningPaymentId === pay.id ? 'Saving...' : '✓ Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={actioningPaymentId === pay.id}
                    onClick={() => void handleDeclinePayment(pay)}
                    className="flex flex-1 items-center justify-center rounded-lg border border-[#FECACA] bg-[#FEE2E2] py-2 text-[10px] font-bold text-[#DC2626] disabled:opacity-70"
                  >
                    ✕ Decline
                  </button>
                </div>
              </div>
            ))}
            {pendingPayments.length > 2 ? (
              <p className="mt-1 text-center text-[9px] font-semibold text-[#DC2626]">
                +{pendingPayments.length - 2} more → open Payments on a project
              </p>
            ) : null}
          </section>
        ) : null}

        {!isCustomer && pendingInvitations.length > 0 ? (
          <section className="rounded-2xl border border-[#C4B5FD] bg-[#EDE9FE] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[13px]">📨</span>
              <span className="text-[10px] font-bold tracking-wide text-[#5B21B6]">
                {pendingInvitations.length} WORK INVITATION{pendingInvitations.length > 1 ? 'S' : ''} PENDING
              </span>
            </div>
            {pendingInvitations.slice(0, 2).map((invite) => (
              <div key={invite.id} className="mb-1.5 rounded-[10px] bg-white p-2.5 last:mb-0">
                <div className="mb-1.5 flex justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[#2C2C2A]">{invite.projectName}</p>
                    <p className="mt-0.5 text-[9px] text-[#78716C]">
                      From: {invite.customerName} · as {invite.role === 'contractor' ? 'Contractor' : 'Worker'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-[#EDE9FE] px-1.5 py-0.5 text-[8px] font-bold text-[#5B21B6]">
                    New
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={actioningInviteId === invite.id}
                    onClick={() => void handleAcceptInvitation(invite)}
                    className="flex flex-1 items-center justify-center rounded-lg py-2 text-[10px] font-bold text-white disabled:opacity-70"
                    style={{ backgroundColor: actioningInviteId === invite.id ? '#A8A29E' : '#7C3AED' }}
                  >
                    {actioningInviteId === invite.id ? 'Saving...' : '✓ Accept'}
                  </button>
                  <button
                    type="button"
                    disabled={actioningInviteId === invite.id}
                    onClick={() => void handleDeclineInvitation(invite)}
                    className="flex flex-1 items-center justify-center rounded-lg border border-[#C4B5FD] bg-[#F5F3FF] py-2 text-[10px] font-bold text-[#5B21B6] disabled:opacity-70"
                  >
                    ✕ Decline
                  </button>
                </div>
              </div>
            ))}
            {pendingInvitations.length > 2 ? (
              <p className="mt-1 text-center text-[9px] font-semibold text-[#5B21B6]">
                +{pendingInvitations.length - 2} more →{' '}
                <Link href="/profile" className="underline">
                  Profile
                </Link>
              </p>
            ) : null}
          </section>
          ) : null}

        <section className="mb-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-[#1C1917]">Your Projects</h2>
            {isCustomer ? (
              <Link
                href="/projects/new"
                className="rounded-full border border-[#F5DDD4] bg-[#FBF0EB] px-3.5 py-1.5 text-[13px] font-bold text-[#D85A30]"
              >
                + New
              </Link>
            ) : null}
          </div>

          {projects.length === 0 ? (
            <div className="rounded-[20px] bg-white py-12 text-center shadow-sm">
              <p className="mb-3 text-5xl">🏗️</p>
              <p className="mb-2 text-lg font-bold text-[#1C1917]">No projects yet</p>
              <p className="mx-auto max-w-[260px] text-sm leading-5 text-[#78716C]">
                {isCustomer ? 'Tap + New to create your first project' : 'You will see projects here once invited'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => {
                const effectiveStatus =
                  (project.status === 'pending' || project.status === 'on_hold') &&
                  (profile.role !== 'customer' || workerProjectSet.has(project.id))
                    ? 'active'
                    : project.status
                const statusCfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.active
                const statusLabel =
                  effectiveStatus === 'pending' || effectiveStatus === 'on_hold'
                    ? awaitingLabel(project)
                    : statusCfg.label
                const hideStagePill = workerProjectSet.has(project.id)
                const stage = STAGE_COLORS[project.current_stage] ?? STAGE_COLORS.foundation
                const progress = STAGE_PROGRESS[project.current_stage] ?? 10

                return (
                  <Link
                    href={`/projects/${project.id}`}
                    key={project.id}
                    className="block rounded-[18px] bg-white p-4 shadow-sm"
                    style={{ borderLeft: `4px solid ${statusCfg.border}` }}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <h3 className="truncate text-base font-bold text-[#1C1917]">{project.name}</h3>
                      {!hideStagePill ? (
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
                          style={{ backgroundColor: stage.bg, color: stage.text }}
                        >
                          {project.current_stage}
                        </span>
                      ) : null}
                    </div>

                    <p className="mb-3 text-[13px] text-[#78716C]">📍 {project.city}</p>

                    <div className="mb-2.5 h-[5px] overflow-hidden rounded bg-[#EDE8E3]">
                      <div className="h-[5px] rounded bg-[#D85A30]" style={{ width: `${progress}%` }} />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: statusCfg.bg, color: statusCfg.text }}
                      >
                        {statusLabel}
                      </span>
                      <span className="shrink-0 text-[11px] text-[#A8A29E]">
                        {progress}% · {daysAgoLabel(latestUpdateByProject.get(project.id))}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {isCustomer && sitePhotos.length > 0 ? (
          <section className="rounded-2xl border border-[#E8DDD4] bg-white p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#2C2C2A]">Latest Site Photos</span>
              <Link href="/projects" className="text-[9px] font-semibold text-[#D85A30]">
                See all →
              </Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sitePhotos.map((photo, idx) => (
                <Link
                  key={`${photo.projectId}-${idx}`}
                  href={`/projects/${photo.projectId}?tab=updates`}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.photoUrl} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-1">
                    <p className="truncate text-[7px] font-semibold text-white">{photo.projectName}</p>
                    <p className="text-[6px] capitalize text-white/70">{photo.stageTag}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {!isCustomer && updatesDue.length > 0 ? (
          <section className="rounded-2xl border border-[#FDE68A] bg-[#FEF3C7] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[13px]">⏰</span>
              <span className="text-[10px] font-bold text-[#92400E]">POST SITE UPDATES TODAY</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {updatesDue.map((due) => {
                const overdue = due.daysSince >= 2
                const done = due.daysSince === 0
                return (
                  <Link
                    key={due.projectId}
                    href={`/projects/${due.projectId}?tab=updates`}
                    className="flex w-[90px] shrink-0 flex-col items-center rounded-[10px] bg-white/70 p-2"
                  >
                    <p className="line-clamp-1 text-center text-[9px] font-bold text-[#2C2C2A]">{due.projectName}</p>
                    <p
                      className="mt-1 text-[8px] font-semibold"
                      style={{ color: done ? '#166534' : overdue ? RED : '#92400E' }}
                    >
                      {done ? 'Updated ✓' : due.daysSince >= 999 ? 'No updates' : `${due.daysSince}d ago`}
                    </p>
                    {!done ? (
                      <span className="mt-1.5 rounded-md bg-[#D85A30] px-2 py-1 text-[8px] font-bold text-white">
                        + Post
                      </span>
                    ) : (
                      <span className="mt-1.5 rounded-md border border-[#A7F3D0] bg-[#DCFCE7] px-2 py-1 text-[8px] font-bold text-[#166534]">
                        Done ✓
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        ) : null}

        {activityFeed.length > 0 ? (
          <section className="rounded-2xl border border-[#E8DDD4] bg-white p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wide text-[#A8A29E]">RECENT ACTIVITY</span>
              <Link href="/projects" className="text-[9px] font-semibold text-[#D85A30]">
                View all
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {activityFeed.map((item, idx) => {
                const isLast = idx === activityFeed.length - 1
                const tab =
                  item.type === 'payment' ? 'payments' : item.type === 'update' ? 'updates' : 'chat'
                return (
                  <Link
                    key={item.id}
                    href={`/projects/${item.projectId}?tab=${tab}`}
                    className="flex gap-2.5"
                  >
                    <div className="flex flex-col items-center pt-0.5">
                      <ActivityDot type={item.type} status={item.status} />
                      {!isLast ? <span className="mt-1 min-h-[28px] w-0.5 bg-[#F2EDE8]" /> : null}
                    </div>
                    <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-1.5'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 flex-1 text-[11px] font-bold text-[#2C2C2A]">{item.title}</p>
                        {item.status === 'pending_confirmation' ? (
                          <span className="shrink-0 rounded-md bg-[#FEF3C7] px-1 py-0.5 text-[7px] font-bold text-[#92400E]">
                            Pending
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[9px] text-[#78716C]">
                        {item.projectName} · {item.subtitle}
                      </p>
                      <p className="mt-0.5 text-[8px] text-[#A8A29E]">{relativeTime(item.date)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-[#E8DDD4] bg-white px-8 py-10 text-center">
            <p className="mb-2 text-4xl">🏗️</p>
            <p className="mb-1.5 text-[15px] font-bold text-[#2C2C2A]">No activity yet</p>
            <p className="text-xs leading-relaxed text-[#78716C]">
              {isCustomer ? 'Go to Projects to create your first project' : 'Activity will appear here once projects start'}
            </p>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {isCustomer ? (
            <Link
              href="/projects/new"
              className="rounded-2xl px-4 py-2.5 text-[13px] font-bold text-white"
              style={{ backgroundColor: BRAND }}
            >
              + New project
            </Link>
          ) : null}
          <Link
            href="/projects"
            className="rounded-2xl border border-[#E8DDD4] bg-white px-4 py-2.5 text-[13px] font-bold text-[#2C2C2A]"
          >
            All projects
          </Link>
        </div>
      </div>
    </div>
  )
}
