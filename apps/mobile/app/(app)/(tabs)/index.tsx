import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Dimensions,
  Image,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { apiPost } from '@/lib/api'

const { width } = Dimensions.get('window')

const BRAND = '#D85A30'
const CHARCOAL = '#2C2C2A'
const PAGE_BG = '#F2EDE8'
const CARD_BG = '#FFFFFF'
const CARD_BORDER = '#E8DDD4'
const MUTED = '#78716C'
const MUTED_LIGHT = '#A8A29E'
const GREEN_BG = '#DCFCE7'
const AMBER = '#F59E0B'
const AMBER_BG = '#FEF3C7'
const RED = '#DC2626'
const RED_BG = '#FEE2E2'
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
  photoUrl?: string
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

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
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

type TooltipState = {
  index: number
  x: number
  y: number
  amount: number
  date: string
} | null

function SparklineChart({
  points,
  color,
  chartWidth = 180,
  height = 56,
}: {
  points: SparkPoint[]
  color: string
  chartWidth?: number
  height?: number
}) {
  const reactId = useId().replace(/:/g, '')
  const gradId = `spark_${reactId}_${color.replace(/#/g, '')}`
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  if (points.length < 2) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.3)',
            fontStyle: 'italic',
          }}
        >
          No payment data yet
        </Text>
      </View>
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

  const getX = (i: number) =>
    PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
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
    if (tooltip?.index === i) {
      setTooltip(null)
    } else {
      setTooltip({ index: i, x, y, amount: point.amount, date: point.date })
    }
  }

  const TW = 100
  const TH = 34

  return (
    <View>
      <Svg width={chartWidth} height={height}>
        <Defs>
          <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.35" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </SvgLinearGradient>
        </Defs>

        <Path d={areaPath} fill={`url(#${gradId})`} />

        <Path
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
            <Circle
              key={i}
              cx={getX(i)}
              cy={getY(p.amount)}
              r={isActive ? 5 : 3}
              fill={isActive ? color : 'rgba(255,255,255,0.4)'}
              stroke={color}
              strokeWidth={isActive ? 2 : 1}
              onPress={() => handleDotPress(i, p)}
            />
          )
        })}

        {tooltip ? (() => {
          const tx = Math.max(0, Math.min(tooltip.x - TW / 2, chartWidth - TW))
          const ty = Math.max(0, tooltip.y - TH - 8)
          return (
            <>
              <Path
                d={`M${tx},${ty} h${TW} a4,4 0 0 1 4,4 v${TH - 8} a4,4 0 0 1 -4,4 h-${TW} a4,4 0 0 1 -4,-4 v-${TH - 8} a4,4 0 0 1 4,-4 z`}
                fill="rgba(44,44,42,0.95)"
              />
              <SvgText
                x={tx + TW / 2}
                y={ty + 14}
                fontSize={10}
                fontWeight="800"
                fill={color}
                textAnchor="middle"
              >
                {`₹${tooltip.amount.toLocaleString('en-IN')}`}
              </SvgText>
              <SvgText
                x={tx + TW / 2}
                y={ty + 27}
                fontSize={8}
                fill="rgba(255,255,255,0.7)"
                textAnchor="middle"
              >
                {formatDate(tooltip.date)}
              </SvgText>
            </>
          )
        })() : null}
      </Svg>

      <Text
        style={{
          fontSize: 8,
          color: 'rgba(255,255,255,0.25)',
          fontStyle: 'italic',
          textAlign: 'right',
          marginTop: 2,
        }}
      >
        Tap dots to see values
      </Text>
    </View>
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
    <View
      style={{
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: color,
        marginTop: 2,
        flexShrink: 0,
      }}
    />
  )
}

export default function DashboardScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectHasWorker, setProjectHasWorker] = useState<Map<string, boolean>>(new Map())
  const [projectHasAcceptedProfessional, setProjectHasAcceptedProfessional] = useState<Map<string, boolean>>(new Map())
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

  const paymentChannelSuffixRef = useRef(Math.random().toString(36).slice(2))
  const enquiryChannelSuffixRef = useRef(Math.random().toString(36).slice(2))

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/(auth)/login')
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

    const { data: prof } = await supabase.from('users').select('id, name, role, city').eq('id', user.id).maybeSingle()

    if (!prof) {
      router.replace('/(auth)/register')
      return
    }
    setProfile(prof)

    let approvedProjects: Project[] = []
    let contractorProjects: Project[] = []
    let workerProjects: Project[] = []

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
      if (approvedIds.length > 0) {
        const { data: workerRows } = await supabase.from('project_members').select('project_id').in('project_id', approvedIds).eq('role', 'worker')
        setProjectHasWorker(new Map((workerRows ?? []).map((row) => [row.project_id, true])))
      } else {
        setProjectHasWorker(new Map())
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
          if (first?.photo_urls?.[0]) {
            photos.push({
              projectId: pid,
              projectName: proj?.name ?? 'Project',
              photoUrl: first.photo_urls[0],
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
        const { data: workerRows } = await supabase.from('project_members').select('project_id').in('project_id', ids).eq('role', 'worker')
        setProjectHasWorker(new Map((workerRows ?? []).map((row) => [row.project_id, true])))
        setProjectHasAcceptedProfessional(new Map(ids.map((projectId) => [projectId, true])))
      } else {
        setProjectHasWorker(new Map())
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
        setProjectHasWorker(new Map(workerProjectIds.map((projectId) => [projectId, true])))
        setProjectHasAcceptedProfessional(new Map(workerProjectIds.map((projectId) => [projectId, true])))
      } else {
        setProjects([])
        setProjectHasWorker(new Map())
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
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  const goToNewProject = useCallback(() => {
    console.log('[navigation] dashboard +New -> /projects/new')
    router.push('/projects/new' as const)
  }, [])

  const handleApprovePayment = useCallback(
    async (pay: PendingPayment) => {
      try {
        setActioningPaymentId(pay.id)
        await apiPost<{ success?: boolean; error?: string }>(
          `/api/projects/${pay.projectId}/payments/respond`,
          { payment_id: pay.id, action: 'approve' }
        )
        setPendingPayments((prev) => prev.filter((p) => p.id !== pay.id))
        void loadData()
      } catch (err) {
        Alert.alert(
          'Payment',
          err instanceof Error ? err.message : 'Unable to approve'
        )
      } finally {
        setActioningPaymentId(null)
      }
    },
    [loadData]
  )

  const handleDeclinePayment = useCallback(
    async (pay: PendingPayment) => {
      Alert.alert(
        'Decline payment?',
        `Decline ₹${pay.amount.toLocaleString('en-IN')} for ${pay.projectName}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Decline',
            style: 'destructive',
            onPress: async () => {
              try {
                setActioningPaymentId(pay.id)
                await apiPost<{ success?: boolean; error?: string }>(
                  `/api/projects/${pay.projectId}/payments/respond`,
                  { payment_id: pay.id, action: 'decline' }
                )
                setPendingPayments((prev) => prev.filter((p) => p.id !== pay.id))
                void loadData()
              } catch (err) {
                Alert.alert(
                  'Payment',
                  err instanceof Error ? err.message : 'Unable to decline'
                )
              } finally {
                setActioningPaymentId(null)
              }
            },
          },
        ]
      )
    },
    [loadData]
  )

  const handleAcceptInvitation = useCallback(
    async (invite: PendingInvitation) => {
      try {
        setActioningInviteId(invite.id)
        await apiPost<{ success?: boolean; error?: string }>('/api/invitations/respond', {
          project_id: invite.projectId,
          action: 'accept',
        })
        setPendingInvitations((prev) => prev.filter((i) => i.id !== invite.id))
        Alert.alert('Invitation accepted', `You are now part of ${invite.projectName}`)
        void loadData()
      } catch (err) {
        Alert.alert(
          'Invitation',
          err instanceof Error ? err.message : 'Unable to accept'
        )
      } finally {
        setActioningInviteId(null)
      }
    },
    [loadData]
  )

  const handleDeclineInvitation = useCallback(
    async (invite: PendingInvitation) => {
      Alert.alert(
        'Decline invitation?',
        `Decline project "${invite.projectName}" from ${invite.customerName}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Decline',
            style: 'destructive',
            onPress: async () => {
              try {
                setActioningInviteId(invite.id)
                await apiPost<{ success?: boolean; error?: string }>('/api/invitations/respond', {
                  project_id: invite.projectId,
                  action: 'decline',
                })
                setPendingInvitations((prev) => prev.filter((i) => i.id !== invite.id))
                void loadData()
              } catch (err) {
                Alert.alert(
                  'Invitation',
                  err instanceof Error ? err.message : 'Unable to decline'
                )
              } finally {
                setActioningInviteId(null)
              }
            },
          },
        ]
      )
    },
    [loadData]
  )

  useEffect(() => {
    if (!profile?.id || !profile.role) return
    const userId = profile.id
    const channelName = `dashboard-payments-${userId}-${paymentChannelSuffixRef.current}`

    const filter =
      profile.role === 'customer'
        ? `recorded_by=eq.${userId}`
        : `paid_to=eq.${userId}`

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
  }, [loadData, profile?.id, profile?.role])

  useEffect(() => {
    if (!profile?.id) return
    const userId = profile.id
    const channelName = `dashboard-enquiries-${userId}-${enquiryChannelSuffixRef.current}`

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
  }, [loadData, profile?.id])

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </SafeAreaView>
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

  const isCustomer = profile?.role === 'customer'

  const sparkW = width - 32

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }} edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        accessibilityLabel={`Home ${getInitials(profile?.name ?? 'User')}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} colors={[BRAND]} />}
      >
        <LinearGradient
          colors={isCustomer ? ['#2C2C2A', '#2C2C2A'] : ['#2C2C2A', '#1A2A1A']}
          style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 14,
            }}
          >
            <View>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>{getGreeting()} 👋</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4 }}>
                {profile?.name.split(' ')[0]}
              </Text>
              <View
                style={{
                  backgroundColor: 'rgba(216,90,48,0.3)',
                  borderRadius: 20,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  alignSelf: 'flex-start',
                  marginTop: 5,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: '700', color: BRAND, textTransform: 'capitalize' }}>{profile?.role}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>
                {isCustomer ? 'Total paid' : 'Total earned'}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: isCustomer ? BRAND : '#10B981' }}>
                ₹{totalPaid.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>

          <View style={{ width: '100%' }}>
            <SparklineChart points={sparkPoints} color={isCustomer ? BRAND : '#10B981'} chartWidth={sparkW} height={56} />
            {sparkPoints.length >= 2 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>
                  {new Date(sparkPoints[0]!.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
                <Text style={{ fontSize: 8, color: isCustomer ? BRAND : '#10B981', fontWeight: '700' }}>
                  {new Date(sparkPoints[sparkPoints.length - 1]!.date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  ↑
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFFFFF' }}>{activeCount}</Text>
              <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {isCustomer ? 'Active' : 'Projects'}
              </Text>
              {isCustomer && pendingCount > 0 ? (
                <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{pendingCount} awaiting</Text>
              ) : null}
            </View>

            {isCustomer ? (
              <>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#60A5FA' }}>{newUpdatesCount}</Text>
                  <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>New updates</Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#A78BFA' }}>{pendingInvitesCount}</Text>
                  <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Invitations</Text>
                </View>
              </>
            ) : (
              <>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: pendingPayments.length > 0 ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: 10,
                    alignItems: 'center',
                    borderWidth: pendingPayments.length > 0 ? 0.5 : 0,
                    borderColor: 'rgba(220,38,38,0.4)',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: '800',
                      color: pendingPayments.length > 0 ? '#F87171' : '#FFFFFF',
                    }}
                  >
                    {pendingPayments.length}
                  </Text>
                  <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Pay pending</Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#FCD34D' }}>★{profile ? '4.6' : '—'}</Text>
                  <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Rating</Text>
                </View>
              </>
            )}
          </View>
        </LinearGradient>

        <View style={{ padding: 14, gap: 12 }}>
          {isCustomer && pendingPayments.length > 0 ? (
            <View
              style={{
                backgroundColor: AMBER_BG,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: '#FDE68A',
                padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <Text style={{ fontSize: 13 }}>⏳</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E', letterSpacing: 0.05 }}>
                  {pendingPayments.length} PAYMENT{pendingPayments.length > 1 ? 'S' : ''} AWAITING CONTRACTOR
                </Text>
              </View>
              {pendingPayments.slice(0, 2).map((pay) => (
                <TouchableOpacity
                  key={pay.id}
                  onPress={() =>
                    router.push({
                      pathname: '/projects/[id]',
                      params: { id: pay.projectId, tab: 'payments' },
                    })
                  }
                  style={{
                    backgroundColor: CARD_BG,
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 6,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: CHARCOAL }}>{pay.projectName}</Text>
                    <Text style={{ fontSize: 9, color: MUTED, marginTop: 1, textTransform: 'capitalize' }}>
                      {pay.category.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: CHARCOAL }}>
                    ₹{pay.amount.toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {!isCustomer && pendingPayments.length > 0 ? (
            <View
              style={{
                backgroundColor: RED_BG,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#FECACA',
                padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <Text style={{ fontSize: 13 }}>⚠️</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: RED, letterSpacing: 0.05 }}>
                  {pendingPayments.length} PAYMENT{pendingPayments.length > 1 ? 'S' : ''} NEED YOUR APPROVAL
                </Text>
              </View>
              {pendingPayments.slice(0, 2).map((pay) => (
                <View
                  key={pay.id}
                  style={{
                    backgroundColor: CARD_BG,
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 6,
                  }}
                >
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() =>
                      router.push({
                        pathname: '/projects/[id]',
                        params: { id: pay.projectId, tab: 'payments', paymentId: pay.id },
                      })
                    }
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: CHARCOAL }}>{pay.projectName}</Text>
                        <Text style={{ fontSize: 9, color: MUTED, marginTop: 1, textTransform: 'capitalize' }}>
                          {pay.category.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: CHARCOAL }}>
                        ₹{pay.amount.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor:
                          actioningPaymentId === pay.id ? '#A8A29E' : '#10B981',
                        borderRadius: 8,
                        padding: 8,
                        alignItems: 'center',
                        opacity: actioningPaymentId === pay.id ? 0.7 : 1,
                      }}
                      disabled={actioningPaymentId === pay.id}
                      onPress={() => void handleApprovePayment(pay)}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>
                        {actioningPaymentId === pay.id ? 'Saving...' : '✓ Approve'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: '#FEE2E2',
                        borderRadius: 8,
                        padding: 8,
                        alignItems: 'center',
                        borderWidth: 0.5,
                        borderColor: '#FECACA',
                        opacity: actioningPaymentId === pay.id ? 0.7 : 1,
                      }}
                      disabled={actioningPaymentId === pay.id}
                      onPress={() => void handleDeclinePayment(pay)}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>✕ Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {pendingPayments.length > 2 ? (
                <Text style={{ textAlign: 'center', fontSize: 9, color: RED, fontWeight: '600', marginTop: 2 }}>
                  +{pendingPayments.length - 2} more → go to Payments tab
                </Text>
              ) : null}
            </View>
          ) : null}

          {!isCustomer && pendingInvitations.length > 0 ? (
            <View
              style={{
                backgroundColor: '#EDE9FE',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#C4B5FD',
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 13 }}>📨</Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: '#5B21B6',
                    letterSpacing: 0.05,
                  }}
                >
                  {pendingInvitations.length} WORK INVITATION
                  {pendingInvitations.length > 1 ? 'S' : ''} PENDING
                </Text>
              </View>
              {pendingInvitations.slice(0, 2).map((invite) => (
                <View
                  key={invite.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 6,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 6,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2A' }} numberOfLines={1}>
                        {invite.projectName}
                      </Text>
                      <Text style={{ fontSize: 9, color: '#78716C', marginTop: 2 }}>
                        From: {invite.customerName} · as {invite.role === 'contractor' ? 'Contractor' : 'Worker'}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: '#EDE9FE',
                        borderRadius: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ fontSize: 8, fontWeight: '700', color: '#5B21B6' }}>New</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor:
                          actioningInviteId === invite.id ? '#A8A29E' : '#7C3AED',
                        borderRadius: 8,
                        padding: 8,
                        alignItems: 'center',
                        opacity: actioningInviteId === invite.id ? 0.7 : 1,
                      }}
                      disabled={actioningInviteId === invite.id}
                      onPress={() => void handleAcceptInvitation(invite)}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>
                        {actioningInviteId === invite.id ? 'Saving...' : '✓ Accept'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: '#F5F3FF',
                        borderRadius: 8,
                        padding: 8,
                        alignItems: 'center',
                        borderWidth: 0.5,
                        borderColor: '#C4B5FD',
                        opacity: actioningInviteId === invite.id ? 0.7 : 1,
                      }}
                      disabled={actioningInviteId === invite.id}
                      onPress={() => void handleDeclineInvitation(invite)}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#5B21B6' }}>✕ Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {pendingInvitations.length > 2 ? (
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 9,
                    color: '#5B21B6',
                    fontWeight: '600',
                    marginTop: 2,
                  }}
                >
                  +{pendingInvitations.length - 2} more → check Profile tab
                </Text>
              ) : null}
            </View>
          ) : null}

          {isCustomer && sitePhotos.length > 0 ? (
            <View
              style={{
                backgroundColor: CARD_BG,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: CARD_BORDER,
                padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: CHARCOAL }}>Latest Site Photos</Text>
                <Text style={{ fontSize: 9, color: BRAND, fontWeight: '600' }}>See all →</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {sitePhotos.map((photo, idx) => (
                  <TouchableOpacity
                    key={`${photo.projectId}-${idx}`}
                    onPress={() =>
                      router.push({
                        pathname: '/projects/[id]',
                        params: { id: photo.projectId, tab: 'updates' },
                      })
                    }
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 12,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <Image source={{ uri: photo.photoUrl }} style={{ width: 80, height: 80 }} resizeMode="cover" />
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        padding: 4,
                      }}
                    >
                      <Text style={{ fontSize: 7, color: '#FFFFFF', fontWeight: '600' }} numberOfLines={1}>
                        {photo.projectName}
                      </Text>
                      <Text style={{ fontSize: 6, color: 'rgba(255,255,255,0.7)', textTransform: 'capitalize' }}>
                        {photo.stageTag}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {!isCustomer && updatesDue.length > 0 ? (
            <View
              style={{
                backgroundColor: AMBER_BG,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: '#FDE68A',
                padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <Text style={{ fontSize: 13 }}>⏰</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E' }}>POST SITE UPDATES TODAY</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {updatesDue.map((due) => {
                  const overdue = due.daysSince >= 2
                  const done = due.daysSince === 0
                  return (
                    <TouchableOpacity
                      key={due.projectId}
                      onPress={() =>
                        router.push({
                          pathname: '/projects/[id]',
                          params: { id: due.projectId, tab: 'updates' },
                        })
                      }
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.7)',
                        borderRadius: 10,
                        padding: 8,
                        width: 90,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '700', color: CHARCOAL, textAlign: 'center' }} numberOfLines={1}>
                        {due.projectName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 8,
                          color: done ? '#166534' : overdue ? RED : '#92400E',
                          marginTop: 3,
                          fontWeight: '600',
                        }}
                      >
                        {done ? 'Updated ✓' : due.daysSince >= 999 ? 'No updates' : `${due.daysSince}d ago`}
                      </Text>
                      {!done ? (
                        <View style={{ backgroundColor: BRAND, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 5 }}>
                          <Text style={{ fontSize: 8, fontWeight: '700', color: '#FFFFFF' }}>+ Post</Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            backgroundColor: GREEN_BG,
                            borderRadius: 6,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            marginTop: 5,
                            borderWidth: 0.5,
                            borderColor: '#A7F3D0',
                          }}
                        >
                          <Text style={{ fontSize: 8, fontWeight: '700', color: '#166534' }}>Done ✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          ) : null}

          {activityFeed.length > 0 ? (
            <View
              style={{
                backgroundColor: CARD_BG,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: CARD_BORDER,
                padding: 12,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED_LIGHT, letterSpacing: 0.06 }}>RECENT ACTIVITY</Text>
                <Text style={{ fontSize: 9, color: BRAND, fontWeight: '600' }}>View all</Text>
              </View>

              {activityFeed.map((item, idx) => {
                const isLast = idx === activityFeed.length - 1
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => {
                      router.push({
                        pathname: '/projects/[id]',
                        params: {
                          id: item.projectId,
                          tab: item.type === 'payment' ? 'payments' : item.type === 'update' ? 'updates' : 'chat',
                        },
                      })
                    }}
                    style={{ flexDirection: 'row', gap: 10, paddingBottom: isLast ? 0 : 8 }}
                  >
                    <View style={{ alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
                      <ActivityDot type={item.type} status={item.status} />
                      {!isLast ? (
                        <View
                          style={{
                            width: 1.5,
                            minHeight: 28,
                            backgroundColor: PAGE_BG,
                            marginTop: 3,
                          }}
                        />
                      ) : null}
                    </View>

                    <View style={{ flex: 1, paddingBottom: isLast ? 0 : 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: CHARCOAL, flex: 1, marginRight: 8 }} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {item.status === 'pending_confirmation' ? (
                          <View style={{ backgroundColor: AMBER_BG, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0 }}>
                            <Text style={{ fontSize: 7, fontWeight: '700', color: '#92400E' }}>Pending</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 9, color: MUTED, marginTop: 2 }} numberOfLines={1}>
                        {item.projectName} · {item.subtitle}
                      </Text>
                      <Text style={{ fontSize: 8, color: MUTED_LIGHT, marginTop: 1 }}>{relativeTime(item.date)}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: CARD_BG,
                borderRadius: 16,
                borderWidth: 0.5,
                borderColor: CARD_BORDER,
                padding: 32,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 40, marginBottom: 10 }}>🏗️</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: CHARCOAL, marginBottom: 6 }}>No activity yet</Text>
              <Text style={{ fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 }}>
                {isCustomer ? 'Go to Projects to create your first project' : 'Activity will appear here once projects start'}
              </Text>
            </View>
          )}

          {isCustomer ? (
            <TouchableOpacity
              onPress={goToNewProject}
              style={{
                alignSelf: 'center',
                marginTop: 4,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: BRAND,
              }}
              activeOpacity={0.9}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>+ New project</Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ height: 80 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
