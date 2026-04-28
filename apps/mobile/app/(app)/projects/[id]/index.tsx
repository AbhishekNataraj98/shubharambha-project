import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useSessionState } from '@/lib/auth-state'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChatTab } from '@/components/project-detail/ChatTab'
import { PaymentsTab } from '@/components/project-detail/PaymentsTab'
import { ReportsTab } from '@/components/project-detail/ReportsTab'
import { UpdatesTab } from '@/components/project-detail/UpdatesTab'
import type { DetailTab } from '@/components/project-detail/types'

type ProjectRow = {
  id: string
  name: string
  address: string
  city: string
  status: string
  current_stage: string
  customer_id: string
  contractor_id: string | null
}

function ProjectDetailSkeleton() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['left', 'right']}>
      <View style={{ flex: 1, backgroundColor: '#FAFAFA', padding: 16 }}>
        <View
          style={{
            height: 150,
            borderRadius: 14,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#F3F4F6',
            marginBottom: 12,
          }}
        />
        <View
          style={{
            height: 56,
            borderRadius: 12,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#F3F4F6',
            marginBottom: 12,
          }}
        />
        <View
          style={{
            flex: 1,
            borderRadius: 12,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#F3F4F6',
          }}
        />
      </View>
    </SafeAreaView>
  )
}

export default function ProjectDetailScreen() {
  const { id, tab, updateId, paymentId, workerDetails } = useLocalSearchParams<{
    id: string
    tab?: string
    updateId?: string
    paymentId?: string
    workerDetails?: string
  }>()
  const { user, profile, loading: authLoading } = useSessionState()
  const [activeTab, setActiveTab] = useState<DetailTab>('updates')
  const [project, setProject] = useState<ProjectRow | null>(null)
  const [customerName, setCustomerName] = useState('Customer')
  const [contractorName, setContractorName] = useState('Contractor')
  const [workerInviteProject, setWorkerInviteProject] = useState(false)
  const [hasAcceptedProfessional, setHasAcceptedProfessional] = useState(false)
  const [professionalId, setProfessionalId] = useState<string | null>(null)
  const [professionalRole, setProfessionalRole] = useState<'worker' | 'contractor' | null>(null)
  const [professionalName, setProfessionalName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    if (!id || !user?.id) return
    setLoading(true)
    setForbidden(false)
    const { data: row, error } = await supabase
      .from('projects')
      .select('id,name,address,city,status,current_stage,customer_id,contractor_id')
      .eq('id', id)
      .maybeSingle()

    if (error || !row) {
      setProject(null)
      setLoading(false)
      return
    }

    const p = row as ProjectRow
    const { data: membersForProject = [] } = await supabase
      .from('project_members')
      .select('user_id,role')
      .eq('project_id', p.id)
    const memberProfessionalIds = membersForProject
      .filter((member) => member.role === 'worker' || member.role === 'contractor')
      .map((member) => member.user_id)
    const relatedUserIds = Array.from(new Set([p.customer_id, p.contractor_id, ...memberProfessionalIds].filter(Boolean))) as string[]
    const { data: usersData = [] } = relatedUserIds.length
      ? await supabase.from('users').select('id,name').in('id', relatedUserIds)
      : { data: [] as Array<{ id: string; name: string }> }

    const isCustomer = p.customer_id === user.id
    const isContractor = p.contractor_id === user.id
    if (!isCustomer && !isContractor) {
      const isMember = membersForProject.some((member) => member.user_id === user.id)
      if (!isMember) {
        setForbidden(true)
        setLoading(false)
        return
      }
    }
    const hasAcceptedWorker = membersForProject.some(
      (member) => member.user_id !== p.customer_id && member.role === 'worker'
    )
    const hasAcceptedProfessionalMember = membersForProject.some(
      (member) => member.user_id !== p.customer_id && (member.role === 'worker' || member.role === 'contractor')
    )
    setWorkerInviteProject(hasAcceptedWorker)
    setHasAcceptedProfessional(hasAcceptedProfessionalMember)
    const preferredProfessional =
      membersForProject.find((member) => member.user_id !== p.customer_id && member.role === 'worker') ??
      membersForProject.find((member) => member.user_id !== p.customer_id && member.role === 'contractor') ??
      null
    const preferredProfessionalId = preferredProfessional?.user_id ?? p.contractor_id ?? null
    const preferredProfessionalRole =
      preferredProfessional?.role === 'worker' || preferredProfessional?.role === 'contractor'
        ? preferredProfessional.role
        : p.contractor_id
          ? 'contractor'
          : null

    let cName = 'Customer'
    let coName = 'Contractor'
    if (usersData.length) {
      const map = new Map(usersData.map((u) => [u.id, u.name]))
      cName = map.get(p.customer_id) ?? 'Customer'
      coName = p.contractor_id ? map.get(p.contractor_id) ?? 'Contractor' : 'Contractor'
      if (preferredProfessionalId) {
        setProfessionalName(map.get(preferredProfessionalId) ?? null)
      } else {
        setProfessionalName(null)
      }
    } else {
      setProfessionalName(null)
    }
    setProfessionalId(preferredProfessionalId)
    setProfessionalRole(preferredProfessionalRole)

    setProject(p)
    setCustomerName(cName)
    setContractorName(coName)
    setLoading(false)
  }, [id, user?.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab === 'payments') setActiveTab('payments')
    else if (tab === 'chat') setActiveTab('chat')
    else if (tab === 'reports') setActiveTab('reports')
    else if (tab === 'updates') setActiveTab('updates')
  }, [tab])

  useEffect(() => {
    if ((workerDetails === '1' || workerInviteProject) && activeTab === 'reports') {
      setActiveTab('updates')
    }
  }, [activeTab, workerDetails, workerInviteProject])

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E8590C" />
        </View>
      </SafeAreaView>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />
  if (!profile) return <Redirect href="/(auth)/register" />
  if (forbidden) return <Redirect href="/(app)/(tabs)" />
  if (!id) return null

  if (loading) {
    return <ProjectDetailSkeleton />
  }

  if (!project) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top', 'left', 'right']}>
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#6B7280' }}>Project not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  const role = profile.role as 'customer' | 'contractor' | 'worker'
  const effectiveProjectStatus =
    (project.status === 'pending' || project.status === 'on_hold') &&
    (role !== 'customer' || hasAcceptedProfessional)
      ? 'active'
      : project.status
  const listHeaderProps = {
    projectName: project.name,
    address: project.address,
    city: project.city,
    status: effectiveProjectStatus,
    currentStage: project.current_stage,
    customerName,
    contractorName,
    professionalName:
      professionalName ??
      (professionalRole === 'worker' ? 'Worker' : professionalRole === 'contractor' ? 'Contractor' : undefined),
    professionalRole,
    onPressProfessional:
      role === 'customer' && professionalId
        ? () => {
            router.push({
              pathname: '/contractors/[id]',
              params: { id: professionalId, projectId: project.id },
            })
          }
        : undefined,
    contractorAssigned: Boolean(project.contractor_id),
    hideStageTracker: workerDetails === '1' || workerInviteProject,
    showReportsTab: !(workerDetails === '1' || workerInviteProject),
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['left', 'right']}>
      <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
        {activeTab === 'updates' ? (
          <UpdatesTab
            projectId={project.id}
            currentUserId={user.id}
            currentUserRole={profile.role}
            contractorName={contractorName}
            focusUpdateId={typeof updateId === 'string' ? updateId : undefined}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            listHeaderProps={listHeaderProps}
          />
        ) : activeTab === 'payments' ? (
          <PaymentsTab
            projectId={project.id}
            currentUserId={user.id}
            currentUserRole={role}
            contractorId={project.contractor_id}
            customerId={project.customer_id}
            focusPaymentId={typeof paymentId === 'string' ? paymentId : undefined}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            listHeaderProps={listHeaderProps}
          />
        ) : activeTab === 'chat' ? (
          <ChatTab
            projectId={project.id}
            currentUserId={user.id}
            currentUserName={profile.name}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            listHeaderProps={listHeaderProps}
          />
        ) : (
          <ReportsTab
            projectId={project.id}
            currentUserRole={role}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            listHeaderProps={listHeaderProps}
          />
        )}
      </View>
    </SafeAreaView>
  )
}
