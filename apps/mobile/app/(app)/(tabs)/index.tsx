import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, StyleSheet,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'

const { width } = Dimensions.get('window')

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

const STAGE_PROGRESS: Record<string, number> = {
  foundation: 10,
  plinth: 25,
  walls: 45,
  slab: 60,
  plastering: 80,
  finishing: 100,
}

const STATUS_CONFIG: Record<string, {
  bg: string; text: string; label: string; border: string
}> = {
  pending: {
    bg: '#FEF3C7', text: '#92400E',
    label: 'Awaiting Contractor', border: '#F59E0B',
  },
  active: {
    bg: '#D1FAE5', text: '#065F46',
    label: 'In Progress', border: '#10B981',
  },
  completed: {
    bg: '#F2EDE8', text: '#374151',
    label: 'Completed', border: '#9CA3AF',
  },
  cancelled: {
    bg: '#FEE2E2', text: '#991B1B',
    label: 'Cancelled', border: '#EF4444',
  },
}

function awaitingLabel(project: Project) {
  return project.contractor_id ? 'Waiting contractor approval' : 'Waiting worker approval'
}

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  foundation: { bg: '#F1F5F9', text: '#475569' },
  plinth:     { bg: '#EFF6FF', text: '#1D4ED8' },
  walls:      { bg: '#FFFBEB', text: '#92400E' },
  slab:       { bg: '#FFF7ED', text: '#C2410C' },
  plastering: { bg: '#FAF5FF', text: '#6D28D9' },
  finishing:  { bg: '#ECFDF5', text: '#065F46' },
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '').join('')
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '0 days ago'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export default function DashboardScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectHasWorker, setProjectHasWorker] = useState<Map<string, boolean>>(new Map())
  const [projectHasAcceptedProfessional, setProjectHasAcceptedProfessional] = useState<Map<string, boolean>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/(auth)/login'); return }

    const { data: prof } = await supabase
      .from('users')
      .select('id, name, role, city')
      .eq('id', user.id)
      .maybeSingle()

    if (!prof) { router.replace('/(auth)/register'); return }
    setProfile(prof)

    if (prof.role === 'customer') {
      const { data: owned } = await supabase
        .from('projects')
        .select('id, name, address, city, status, current_stage, customer_id, contractor_id, updated_at')
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
        .select('id, name, address, city, status, current_stage, customer_id, contractor_id, updated_at')
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
          .select('id, name, address, city, status, current_stage, customer_id, contractor_id, updated_at')
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

  useEffect(() => { void loadData() }, [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  const goToNewProject = useCallback(() => {
    console.log('[navigation] dashboard +New -> /projects/new')
    router.push('/projects/new' as any)
  }, [])

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#D85A30" />
        </View>
      </SafeAreaView>
    )
  }

  const activeCount = projects.filter((p) => {
    const effectiveStatus =
      (p.status === 'pending' || p.status === 'on_hold') && projectHasAcceptedProfessional.get(p.id) === true
        ? 'active'
        : p.status
    return effectiveStatus === 'active'
  }).length
  const pendingCount = projects.filter((p) => {
    const effectiveStatus =
      (p.status === 'pending' || p.status === 'on_hold') && projectHasAcceptedProfessional.get(p.id) === true
        ? 'active'
        : p.status
    return effectiveStatus === 'pending' || effectiveStatus === 'on_hold'
  }).length
  const isContractor = profile?.role === 'contractor'
  const isCustomer = profile?.role === 'customer'

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#D85A30"
            colors={['#D85A30']}
          />
        }
      >
        <View style={styles.content}>
          {/* Greeting card */}
          <View style={styles.greetingCard}>
            <Text style={styles.greetingText}>
              {getGreeting()}, {profile?.name.split(' ')[0]} 👋
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {profile?.role}
              </Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Active Projects</Text>
              <Text style={styles.statValue}>{activeCount}</Text>
              <View style={[styles.statIcon, { backgroundColor: '#FBF0EB' }]}>
                <Text style={{ fontSize: 16 }}>🏗️</Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>
                {isContractor ? 'Pending Payments ₹' : 'Pending'}
              </Text>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                {isContractor ? '₹0' : pendingCount}
              </Text>
              <View style={[styles.statIcon, { backgroundColor: '#FFFBEB' }]}>
                <Text style={{ fontSize: 16 }}>💰</Text>
              </View>
            </View>
          </View>

          {/* Projects heading */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Projects</Text>
            {isCustomer && (
              <TouchableOpacity
                style={styles.newButton}
                onPress={goToNewProject}
              >
                <Text style={styles.newButtonText}>+ New</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Projects list */}
          {projects.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🏗️</Text>
              <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptySubtitle}>
                {isCustomer
                  ? 'Tap + New to create your first project'
                  : 'You will see projects here once invited'}
              </Text>
            </View>
          ) : (
            projects.map(project => {
              const status = STATUS_CONFIG[project.status]
                ?? STATUS_CONFIG.active!
              const effectiveStatus =
                (project.status === 'pending' || project.status === 'on_hold') &&
                (!isCustomer || projectHasAcceptedProfessional.get(project.id) === true)
                  ? 'active'
                  : project.status
              const effectiveStatusConfig = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.active!
              const statusLabel =
                effectiveStatus === 'pending' || effectiveStatus === 'on_hold'
                  ? awaitingLabel(project)
                  : effectiveStatusConfig.label
              const hideStagePill = projectHasWorker.get(project.id) === true
              const stage = STAGE_COLORS[project.current_stage]
                ?? STAGE_COLORS.foundation!
              const progress = STAGE_PROGRESS[project.current_stage] ?? 10

              return (
                <TouchableOpacity
                  key={project.id}
                  style={[styles.projectCard, {
                    borderLeftColor: effectiveStatusConfig.border
                  }]}
                  onPress={() => router.push(
                    `/projects/${project.id}` as any
                  )}
                  activeOpacity={0.75}
                >
                  {/* Top row */}
                  <View style={styles.projectCardTop}>
                    <Text style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                    {!hideStagePill ? (
                      <View style={[styles.stagePill, {
                        backgroundColor: stage.bg
                      }]}>
                        <Text style={[styles.stagePillText, {
                          color: stage.text
                        }]}>
                          {project.current_stage}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* City */}
                  <Text style={styles.projectCity}>
                    📍 {project.city}
                  </Text>

                  {/* Progress bar */}
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, {
                      width: `${progress}%` as any
                    }]} />
                  </View>

                  {/* Bottom row */}
                  <View style={styles.projectCardBottom}>
                    <View style={[styles.statusBadge, {
                      backgroundColor: effectiveStatusConfig.bg
                    }]}>
                      <Text style={[styles.statusBadgeText, {
                        color: effectiveStatusConfig.text
                      }]}>
                        {statusLabel}
                      </Text>
                    </View>
                    <Text style={styles.lastUpdate}>
                      {progress}% · {relativeTime(project.updated_at)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F2EDE8',
  },
  scroll: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content padding
  content: {
    paddingHorizontal: 16,
    paddingTop: 2,
  },

  // Greeting
  greetingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C2C2A',
    marginBottom: 10,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FBF0EB',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  roleBadgeText: {
    color: '#D85A30',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  statLabel: {
    fontSize: 12,
    color: '#78716C',
    marginBottom: 8,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#D85A30',
  },
  statIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2C2C2A',
  },
  newButton: {
    backgroundColor: '#FBF0EB',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F5DDD4',
  },
  newButtonText: {
    color: '#D85A30',
    fontSize: 13,
    fontWeight: '700',
  },

  // Project card
  projectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  projectCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C2C2A',
    flex: 1,
    marginRight: 8,
  },
  stagePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  stagePillText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  projectCity: {
    fontSize: 13,
    color: '#78716C',
    marginBottom: 12,
  },
  progressTrack: {
    height: 5,
    backgroundColor: '#EDE8E3',
    borderRadius: 3,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
    backgroundColor: '#D85A30',
    borderRadius: 3,
  },
  projectCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  lastUpdate: {
    fontSize: 11,
    color: '#A8A29E',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2A',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#78716C',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
})
