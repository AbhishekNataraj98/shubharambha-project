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
import { LinearGradient } from 'expo-linear-gradient'
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
  contractorName?: string
  workerName?: string
  customerName?: string
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
  completed: { bg: '#F2EDE8', text: '#374151', label: 'Completed', border: '#9CA3AF' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'Cancelled', border: '#EF4444' },
}

function awaitingLabel(project: Project) {
  return project.contractor_id ? 'Waiting contractor approval' : 'Waiting worker approval'
}

/** Legacy stage accents; hero cards use STAGE_GRADIENTS. Kept for parity with shared stage keys. */
const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  foundation: { bg: '#F1F5F9', text: '#475569' },
  plinth: { bg: '#EFF6FF', text: '#1D4ED8' },
  walls: { bg: '#FFFBEB', text: '#92400E' },
  slab: { bg: '#FFF7ED', text: '#C2410C' },
  plastering: { bg: '#FAF5FF', text: '#6D28D9' },
  finishing: { bg: '#ECFDF5', text: '#065F46' },
}

type GradientStop = { from: string; mid: string; to: string }

const STAGE_GRADIENTS: Record<string, GradientStop> = {
  foundation: {
    from: '#4A3828',
    mid: '#6B4A30',
    to: '#8C6040',
  },
  plinth: {
    from: '#1A2744',
    mid: '#1E3A5F',
    to: '#2563EB',
  },
  walls: {
    from: '#3D2A10',
    mid: '#7C4A14',
    to: '#B45309',
  },
  slab: {
    from: '#2D1B4E',
    mid: '#4C2D7A',
    to: '#7C3AED',
  },
  plastering: {
    from: '#0D2A2A',
    mid: '#1A4A3A',
    to: '#0D9488',
  },
  finishing: {
    from: '#14291A',
    mid: '#1A4A28',
    to: '#16A34A',
  },
}

const DEFAULT_GRADIENT: GradientStop = {
  from: '#2C2C2A',
  mid: '#3D2A20',
  to: '#D85A30',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '0 days ago'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

type MemberRow = { project_id: string; user_id: string; role: string | null }

async function attachContractorNames(projectList: Project[]): Promise<Project[]> {
  const contractorIds = Array.from(
    new Set(projectList.map((p) => p.contractor_id).filter(Boolean) as string[])
  )
  if (contractorIds.length === 0) return projectList
  const { data: contractorUsers } = await supabase.from('users').select('id,name').in('id', contractorIds)
  const rows = (contractorUsers ?? []) as Array<{ id: string; name: string }>
  const nameById = new Map(rows.map((u) => [u.id, u.name]))
  return projectList.map((p) => ({
    ...p,
    contractorName: p.contractor_id ? (nameById.get(p.contractor_id) ?? undefined) : undefined,
  }))
}

async function attachWorkerNamesWhenNoContractor(projectList: Project[], memberRows: MemberRow[]): Promise<Project[]> {
  const needsWorker = new Set(projectList.filter((p) => !p.contractor_id).map((p) => p.id))
  const workerIdByProject = new Map<string, string>()
  for (const row of memberRows) {
    if (row.role !== 'worker' || !needsWorker.has(row.project_id)) continue
    if (!workerIdByProject.has(row.project_id)) workerIdByProject.set(row.project_id, row.user_id)
  }
  const workerIds = Array.from(new Set(workerIdByProject.values()))
  if (workerIds.length === 0) return projectList
  const { data: workerUsers } = await supabase.from('users').select('id,name').in('id', workerIds)
  const nameById = new Map((workerUsers ?? []).map((u) => [u.id as string, u.name as string]))
  return projectList.map((p) => {
    if (p.contractor_id) return p
    const wid = workerIdByProject.get(p.id)
    const workerName = wid ? nameById.get(wid) : undefined
    return workerName ? { ...p, workerName } : p
  })
}

async function attachCustomerNames(projectList: Project[]): Promise<Project[]> {
  const customerIds = Array.from(new Set(projectList.map((p) => p.customer_id).filter(Boolean)))
  if (customerIds.length === 0) return projectList
  const { data: customerUsers } = await supabase.from('users').select('id,name').in('id', customerIds)
  const rows = (customerUsers ?? []) as Array<{ id: string; name: string }>
  const nameById = new Map(rows.map((u) => [u.id, u.name]))
  return projectList.map((p) => ({
    ...p,
    customerName: nameById.get(p.customer_id) ?? undefined,
  }))
}

function titleRowParty(item: Project, isCustomer: boolean): { emoji: string; name: string } | null {
  if (isCustomer) {
    if (item.contractorName) return { emoji: '👷', name: item.contractorName }
    if (item.workerName) return { emoji: '🛠️', name: item.workerName }
    return null
  }
  if (item.customerName) return { emoji: '👤', name: item.customerName }
  return null
}

function HeroProjectCard({
  item,
  isCustomer,
  projectHasWorker: _projectHasWorker,
  projectHasAcceptedProfessional,
  onPress,
}: {
  item: Project
  isCustomer: boolean
  projectHasWorker: Map<string, boolean>
  projectHasAcceptedProfessional: Map<string, boolean>
  onPress: () => void
}) {
  const effectiveStatus =
    (item.status === 'pending' || item.status === 'on_hold') &&
    (!isCustomer || projectHasAcceptedProfessional.get(item.id) === true)
      ? 'active'
      : item.status

  const statusCfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.active

  const statusLabel =
    effectiveStatus === 'pending' || effectiveStatus === 'on_hold' ? awaitingLabel(item) : statusCfg.label

  const progress = STAGE_PROGRESS[item.current_stage] ?? 10
  const grad = STAGE_GRADIENTS[item.current_stage] ?? DEFAULT_GRADIENT

  const stageLabel = item.current_stage.charAt(0).toUpperCase() + item.current_stage.slice(1)

  const stageEmoji: Record<string, string> = {
    foundation: '⛏️',
    plinth: '🏗️',
    walls: '🧱',
    slab: '🪨',
    plastering: '🖌️',
    finishing: '✨',
  }
  const emoji = stageEmoji[item.current_stage] ?? '🏗️'

  const statusDot: Record<string, string> = {
    active: '#10B981',
    pending: '#F59E0B',
    on_hold: '#F59E0B',
    completed: '#A8A29E',
    cancelled: '#EF4444',
  }
  const dotColor = statusDot[effectiveStatus] ?? '#A8A29E'

  const party = titleRowParty(item, isCustomer)

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 12,
        height: 158,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 6,
      }}
    >
      <LinearGradient colors={[grad.from, grad.mid, grad.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.28)',
            padding: 14,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              marginBottom: 'auto',
            }}
          >
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.15)',
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.3)',
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 10 }}>{emoji}</Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: '#FFFFFF',
                }}
              >
                {stageLabel}
              </Text>
            </View>
          </View>

          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minWidth: 0,
                  fontSize: 18,
                  fontWeight: '800',
                  color: '#FFFFFF',
                  letterSpacing: -0.3,
                }}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              {party ? (
                <View style={{ flexShrink: 0, maxWidth: 152, marginLeft: 6 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: 'rgba(255,255,255,0.95)',
                      textAlign: 'right',
                    }}
                    numberOfLines={1}
                  >
                    {party.emoji} {party.name}
                  </Text>
                </View>
              ) : null}
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                📍 {item.city}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <View
                style={{
                  flex: 1,
                  height: 4,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 4,
                    width: `${progress}%`,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 2,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: 'rgba(255,255,255,0.9)',
                  minWidth: 32,
                }}
              >
                {progress}%
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  borderRadius: 20,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: dotColor,
                  }}
                />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: '#FFFFFF',
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                {relativeTime(item.updated_at)}
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  )
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

    const { data: prof } = await supabase.from('users').select('id,name,role').eq('id', user.id).maybeSingle()

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
      let memberRows: MemberRow[] = []
      if (projectIds.length > 0) {
        const { data: members } = await supabase.from('project_members').select('project_id,user_id,role').in('project_id', projectIds)
        memberRows = (members ?? []) as MemberRow[]
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
      let enriched = await attachContractorNames(approvedProjects)
      enriched = await attachWorkerNamesWhenNoContractor(enriched, memberRows)
      setProjects(enriched)
      const approvedIds = approvedProjects.map((p) => p.id)
      if (approvedIds.length > 0) {
        const { data: workerRows } = await supabase.from('project_members').select('project_id').in('project_id', approvedIds).eq('role', 'worker')
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
      const withCustomer = await attachCustomerNames(contractorProjects)
      setProjects(withCustomer)
      const ids = contractorProjects.map((p) => p.id)
      if (ids.length > 0) {
        const { data: workerRows } = await supabase.from('project_members').select('project_id').in('project_id', ids).eq('role', 'worker')
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
        const withCustomer = await attachCustomerNames(workerProjects)
        setProjects(withCustomer)
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
    router.push('/projects/new' as const)
  }, [])

  const filteredProjects = useMemo(() => {
    const effectiveStatus = (project: Project) =>
      (project.status === 'pending' || project.status === 'on_hold') && projectHasAcceptedProfessional.get(project.id) === true
        ? 'active'
        : project.status

    if (filter === 'all') return projects
    if (filter === 'pending') return projects.filter((p) => effectiveStatus(p) === 'pending' || effectiveStatus(p) === 'on_hold')
    return projects.filter((p) => effectiveStatus(p) === filter)
  }, [filter, projects, projectHasAcceptedProfessional])

  const isCustomer = profile?.role === 'customer'

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#D85A30" />
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D85A30" colors={['#D85A30']} />}
        ListHeaderComponent={
          <View>
            <View
              style={{
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  marginBottom: 12,
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 26,
                      fontWeight: '800',
                      color: '#2C2C2A',
                      letterSpacing: -0.5,
                    }}
                  >
                    My Projects
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: '#A8A29E',
                      marginTop: 2,
                    }}
                  >
                    {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  flexDirection: 'row',
                  gap: 7,
                  paddingBottom: 2,
                }}
              >
                {FILTERS.map((item) => {
                  const active = filter === item
                  const count = projects.filter((p) => {
                    if (item === 'all') return true
                    const eff =
                      (p.status === 'pending' || p.status === 'on_hold') &&
                      (!isCustomer || projectHasAcceptedProfessional.get(p.id) === true)
                        ? 'active'
                        : p.status
                    if (item === 'pending') return eff === 'pending' || eff === 'on_hold'
                    return eff === item
                  }).length

                  return (
                    <TouchableOpacity
                      key={item}
                      onPress={() => setFilter(item)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 20,
                        backgroundColor: active ? '#2C2C2A' : '#FFFFFF',
                        borderWidth: 0.5,
                        borderColor: active ? '#2C2C2A' : '#E8DDD4',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: active ? '#FFFFFF' : '#78716C',
                        }}
                      >
                        {item.charAt(0).toUpperCase() + item.slice(1)}
                      </Text>
                      {count > 0 ? (
                        <View
                          style={{
                            backgroundColor: active ? '#D85A30' : '#F2EDE8',
                            borderRadius: 10,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            minWidth: 18,
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '700',
                              color: active ? '#FFFFFF' : '#78716C',
                            }}
                          >
                            {count}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View
            style={{
              alignItems: 'center',
              paddingVertical: 56,
              borderRadius: 20,
              overflow: 'hidden',
            }}
          >
            <LinearGradient
              colors={['#2C2C2A', '#3D2A20', '#D85A30']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Text style={{ fontSize: 32 }}>🏗️</Text>
            </LinearGradient>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: '#2C2C2A',
                marginBottom: 8,
              }}
            >
              No projects yet
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: '#78716C',
                textAlign: 'center',
                paddingHorizontal: 32,
                lineHeight: 20,
              }}
            >
              {isCustomer ? 'Tap + to create your first project' : 'You will see projects here once invited'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <HeroProjectCard
            item={item}
            isCustomer={isCustomer}
            projectHasWorker={projectHasWorker}
            projectHasAcceptedProfessional={projectHasAcceptedProfessional}
            onPress={() =>
              router.push({
                pathname: '/projects/[id]',
                params: { id: item.id },
              })
            }
          />
        )}
      />

      {isCustomer ? (
        <TouchableOpacity
          style={{
            position: 'absolute',
            right: 20,
            bottom: 24,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: '#D85A30',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#D85A30',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.45,
            shadowRadius: 12,
            elevation: 8,
          }}
          onPress={goToNewProject}
          activeOpacity={0.9}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 30,
              fontWeight: '300',
              lineHeight: 34,
              marginTop: -2,
            }}
          >
            +
          </Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F2EDE8' },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2EDE8',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 120,
  },
})
