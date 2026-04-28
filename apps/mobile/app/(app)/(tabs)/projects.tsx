import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

type UserProfile = {
  id: string
  name: string
  role: string
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

type TabFilter = 'all' | 'active' | 'pending' | 'completed'

const FILTERS: TabFilter[] = ['all', 'active', 'pending', 'completed']

const STAGE_PROGRESS: Record<string, number> = {
  foundation: 10,
  plinth: 25,
  walls: 45,
  slab: 60,
  plastering: 80,
  finishing: 100,
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; border: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Awaiting Contractor', border: '#F59E0B' },
  on_hold: { bg: '#FEF3C7', text: '#92400E', label: 'Awaiting Contractor', border: '#F59E0B' },
  active: { bg: '#D1FAE5', text: '#065F46', label: 'In Progress', border: '#10B981' },
  completed: { bg: '#F3F4F6', text: '#374151', label: 'Completed', border: '#9CA3AF' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'Cancelled', border: '#EF4444' },
}

function awaitingLabel(project: Project) {
  return project.contractor_id ? 'Waiting contractor approval' : 'Waiting worker approval'
}

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  foundation: { bg: '#F1F5F9', text: '#475569' },
  plinth: { bg: '#EFF6FF', text: '#1D4ED8' },
  walls: { bg: '#FFFBEB', text: '#92400E' },
  slab: { bg: '#FFF7ED', text: '#C2410C' },
  plastering: { bg: '#FAF5FF', text: '#6D28D9' },
  finishing: { bg: '#ECFDF5', text: '#065F46' },
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '0 days ago'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default function ProjectsScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectHasWorker, setProjectHasWorker] = useState<Map<string, boolean>>(new Map())
  const [projectHasAcceptedProfessional, setProjectHasAcceptedProfessional] = useState<Map<string, boolean>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<TabFilter>('all')

  const loadData = useCallback(async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/(auth)/login')
      return
    }

    const { data: prof } = await supabase
      .from('users')
      .select('id,name,role')
      .eq('id', user.id)
      .maybeSingle()

    if (!prof) {
      router.replace('/(auth)/register')
      return
    }
    setProfile(prof as UserProfile)

    if (prof.role === 'customer') {
      const { data: owned } = await supabase
        .from('projects')
        .select('id,name,address,city,status,current_stage,customer_id,contractor_id,updated_at')
        .eq('customer_id', user.id)
        .order('updated_at', { ascending: false })
      const ownedProjects = (owned ?? []) as Project[]
      const projectIds = ownedProjects.map((p) => p.id)
      let approvedProjects = ownedProjects
      if (projectIds.length > 0) {
        const { data: members } = await supabase
          .from('project_members')
          .select('project_id,user_id,role')
          .in('project_id', projectIds)
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
        const { data: workerRows } = await supabase
          .from('project_members')
          .select('project_id')
          .in('project_id', approvedIds)
          .eq('role', 'worker')
        setProjectHasWorker(new Map((workerRows ?? []).map((row) => [row.project_id, true])))
      } else {
        setProjectHasWorker(new Map())
        setProjectHasAcceptedProfessional(new Map())
      }
    } else if (prof.role === 'contractor') {
      const { data: proj } = await supabase
        .from('projects')
        .select('id,name,address,city,status,current_stage,customer_id,contractor_id,updated_at')
        .eq('contractor_id', user.id)
        .in('status', ['active', 'completed'])
        .order('updated_at', { ascending: false })
      const contractorProjects = (proj ?? []) as Project[]
      setProjects(contractorProjects)
      const ids = contractorProjects.map((p) => p.id)
      if (ids.length > 0) {
        const { data: workerRows } = await supabase
          .from('project_members')
          .select('project_id')
          .in('project_id', ids)
          .eq('role', 'worker')
        setProjectHasWorker(new Map((workerRows ?? []).map((row) => [row.project_id, true])))
        setProjectHasAcceptedProfessional(new Map(ids.map((projectId) => [projectId, true])))
      } else {
        setProjectHasWorker(new Map())
        setProjectHasAcceptedProfessional(new Map())
      }
    } else {
      const { data: mem } = await supabase.from('project_members').select('project_id').eq('user_id', user.id)
      const ids = Array.from(new Set((mem ?? []).map((m) => m.project_id)))
      if (ids.length) {
        const { data: proj } = await supabase
          .from('projects')
          .select('id,name,address,city,status,current_stage,customer_id,contractor_id,updated_at')
          .in('id', ids)
          .order('updated_at', { ascending: false })
        const workerProjects = (proj ?? []) as Project[]
        setProjects(workerProjects)
        const workerProjectIds = workerProjects.map((p) => p.id)
        setProjectHasWorker(new Map(workerProjectIds.map((projectId) => [projectId, true])))
        setProjectHasAcceptedProfessional(new Map(workerProjectIds.map((projectId) => [projectId, true])))
      } else {
        setProjects([])
        setProjectHasWorker(new Map())
        setProjectHasAcceptedProfessional(new Map())
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
    console.log('[navigation] projects FAB + -> /projects/new')
    router.push('/projects/new' as any)
  }, [])

  const filteredProjects = useMemo(() => {
    const effectiveStatus = (project: Project) =>
      (project.status === 'pending' || project.status === 'on_hold') &&
      projectHasAcceptedProfessional.get(project.id) === true
        ? 'active'
        : project.status

    if (filter === 'all') return projects
    if (filter === 'pending') return projects.filter((p) => effectiveStatus(p) === 'pending' || effectiveStatus(p) === 'on_hold')
    return projects.filter((p) => effectiveStatus(p) === filter)
  }, [filter, projects, projectHasAcceptedProfessional])

  const isCustomer = profile?.role === 'customer'

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#E8590C" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <FlatList
        data={filteredProjects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8590C" colors={['#E8590C']} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>My Projects</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {FILTERS.map((item) => {
                const active = filter === item
                return (
                  <TouchableOpacity
                    key={item}
                    onPress={() => setFilter(item)}
                    style={[styles.filterBtn, active ? styles.filterBtnActive : styles.filterBtnInactive]}
                  >
                    <Text style={[styles.filterText, active ? styles.filterTextActive : styles.filterTextInactive]}>
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📁</Text>
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptySubtitle}>
              {isCustomer ? 'Tap + to create your first project' : 'You will see projects here once invited'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const effectiveStatus =
            (item.status === 'pending' || item.status === 'on_hold') &&
            (!isCustomer || projectHasAcceptedProfessional.get(item.id) === true)
              ? 'active'
              : item.status
          const status = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.active
          const statusLabel =
            effectiveStatus === 'pending' || effectiveStatus === 'on_hold' ? awaitingLabel(item) : status.label
          const hideStagePill = projectHasWorker.get(item.id) === true
          const stage = STAGE_COLORS[item.current_stage] ?? STAGE_COLORS.foundation
          const progress = STAGE_PROGRESS[item.current_stage] ?? 10

          return (
            <TouchableOpacity
              style={[styles.projectCard, { borderLeftColor: status.border }]}
              onPress={() => router.push({ pathname: '/projects/[id]', params: { id: item.id } })}
              activeOpacity={0.8}
            >
              <View style={styles.projectCardTop}>
                <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
                {!hideStagePill ? (
                  <View style={[styles.stagePill, { backgroundColor: stage.bg }]}>
                    <Text style={[styles.stagePillText, { color: stage.text }]}>{item.current_stage}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.projectCity}>📍 {item.city}</Text>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
              </View>

              <View style={styles.projectCardBottom}>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: status.text }]}>{statusLabel}</Text>
                </View>
                <Text style={styles.lastUpdate}>{progress}% · {relativeTime(item.updated_at)}</Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />

      {isCustomer ? (
        <TouchableOpacity style={styles.fab} onPress={goToNewProject} activeOpacity={0.9}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F4EF' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 110 },
  sectionTitle: { fontSize: 24, fontWeight: '800', color: '#1C1917', marginBottom: 12 },
  filterRow: { flexDirection: 'row', paddingBottom: 8 },
  filterBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  filterBtnActive: {
    backgroundColor: '#E8590C',
    borderWidth: 1,
    borderColor: '#E8590C',
  },
  filterBtnInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E5E4',
  },
  filterText: { fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: '#FFFFFF' },
  filterTextInactive: { color: '#57534E' },
  projectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  projectCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1917',
    flex: 1,
    marginRight: 8,
  },
  stagePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  stagePillText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  projectCity: { fontSize: 13, color: '#78716C', marginBottom: 12 },
  progressTrack: {
    height: 5,
    backgroundColor: '#F5F5F4',
    borderRadius: 3,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: { height: 5, backgroundColor: '#E8590C', borderRadius: 3 },
  projectCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  lastUpdate: { fontSize: 11, color: '#A8A29E' },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 8,
  },
  emptyEmoji: { fontSize: 42, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1917', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#78716C', textAlign: 'center', paddingHorizontal: 28, lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8590C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: '#FFFFFF', fontSize: 28, fontWeight: '300' },
})
