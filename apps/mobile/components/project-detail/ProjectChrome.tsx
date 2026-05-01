import { Text, TouchableOpacity, View } from 'react-native'
import { type DetailTab } from '@/components/project-detail/types'

const BRAND = '#D85A30'

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: '#FEF3C7', fg: '#92400E', label: 'Awaiting Contractor' },
  on_hold: { bg: '#FEF3C7', fg: '#92400E', label: 'Awaiting Contractor' },
  active: { bg: '#D1FAE5', fg: '#065F46', label: 'In Progress' },
  completed: { bg: '#F2EDE8', fg: '#374151', label: 'Completed' },
  cancelled: { bg: '#FEE2E2', fg: '#991B1B', label: 'Cancelled' },
}

function stageProgressWidth(stage: string): string {
  const map: Record<string, string> = {
    foundation: '10%',
    plinth: '25%',
    walls: '45%',
    slab: '60%',
    plastering: '80%',
    finishing: '100%',
  }
  return map[stage] ?? '10%'
}

function stageProgressPercent(stage: string): number {
  const map: Record<string, number> = {
    foundation: 10,
    plinth: 25,
    walls: 45,
    slab: 60,
    plastering: 80,
    finishing: 100,
  }
  return map[stage] ?? 10
}

type ProjectChromeProps = {
  projectName: string
  address: string
  city: string
  status: string
  currentStage: string
  customerName: string
  contractorName: string
  professionalName?: string
  professionalRole?: 'worker' | 'contractor' | null
  onPressProfessional?: () => void
  onPressProjectImages?: () => void
  onPressProjectOverview?: () => void
  contractorAssigned?: boolean
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  tabRowOnly?: boolean
  hideStageTracker?: boolean
  showReportsTab?: boolean
}

export function ProjectHeroAndStage(props: ProjectChromeProps) {
  const { projectName, status, currentStage } = props
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.completed
  const badgeLabel =
    status === 'pending' || status === 'on_hold'
      ? props.contractorAssigned
        ? 'Waiting contractor approval'
        : 'Waiting worker approval'
      : badge.label
  return (
    <>
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 0.5,
          borderBottomColor: '#E8DDD4',
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: '#2C2C2A',
            }}
            numberOfLines={1}
          >
            {projectName}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <View style={{ width: 64, height: 4, backgroundColor: '#F2EDE8', borderRadius: 2, overflow: 'hidden' }}>
              <View
                style={{
                  height: 4,
                  backgroundColor: '#D85A30',
                  borderRadius: 2,
                  width: stageProgressWidth(currentStage),
                }}
              />
            </View>
            <Text style={{ fontSize: 10, color: '#A8A29E', textTransform: 'capitalize' }}>
              {currentStage} · {stageProgressPercent(currentStage)}%
            </Text>
          </View>
        </View>
        <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: badge.bg }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: badge.fg }}>{badgeLabel}</Text>
        </View>
      </View>

      {props.professionalName && props.onPressProfessional ? (
        <TouchableOpacity
          onPress={props.onPressProfessional}
          style={{
            backgroundColor: '#FBF0EB',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderBottomWidth: 0.5,
            borderBottomColor: '#E8DDD4',
          }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#D85A30' }}>
            {props.professionalRole === 'worker' ? 'Worker' : 'Contractor'}: {props.professionalName} (Tap to view profile/review)
          </Text>
        </TouchableOpacity>
      ) : props.professionalName ? (
        <View
          style={{
            backgroundColor: '#FBF0EB',
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderBottomWidth: 0.5,
            borderBottomColor: '#E8DDD4',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#D85A30' }}>
            {props.professionalRole === 'worker' ? 'Worker' : 'Contractor'}: {props.professionalName}
          </Text>
        </View>
      ) : null}

      {props.onPressProjectImages ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: '#FFFFFF',
            borderBottomWidth: 0.5,
            borderBottomColor: '#E8DDD4',
          }}
        >
          <TouchableOpacity
            onPress={props.onPressProjectImages}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#2C2C2A',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 11 }}>📸</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>View Images</Text>
          </TouchableOpacity>
          {props.onPressProjectOverview ? (
            <TouchableOpacity
              onPress={props.onPressProjectOverview}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#FBF0EB',
                borderWidth: 0.5,
                borderColor: '#F5DDD4',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 11 }}>📋</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#D85A30' }}>Overview</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!props.tabRowOnly ? (
        <DetailTabRow
          activeTab={props.activeTab}
          onTabChange={props.onTabChange}
          showReportsTab={props.showReportsTab}
        />
      ) : null}
    </>
  )
}

export function DetailTabRow({
  activeTab,
  onTabChange,
  showReportsTab = true,
}: {
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  showReportsTab?: boolean
}) {
  const tabs: DetailTab[] = showReportsTab ? ['updates', 'payments', 'chat', 'reports'] : ['updates', 'payments', 'chat']
  const TAB_CONFIG: Record<DetailTab, { icon: string; label: string }> = {
    updates: { icon: '📸', label: 'Updates' },
    payments: { icon: '💰', label: 'Payments' },
    chat: { icon: '💬', label: 'Chat' },
    reports: { icon: '📊', label: 'Reports' },
  }

  return (
    <View style={{ flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: 0.5, borderBottomColor: '#E8DDD4' }}>
      {tabs.map((tab) => {
        const active = activeTab === tab
        const config = TAB_CONFIG[tab]
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onTabChange(tab)}
            style={{
              flex: 1,
              paddingVertical: 9,
              alignItems: 'center',
              justifyContent: 'center',
              borderBottomWidth: active ? 2 : 0,
              borderBottomColor: '#D85A30',
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14 }}>{config.icon}</Text>
            <Text
              style={{
                fontSize: 9,
                fontWeight: active ? '700' : '500',
                color: active ? '#D85A30' : '#A8A29E',
                marginTop: 2,
              }}
            >
              {config.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
