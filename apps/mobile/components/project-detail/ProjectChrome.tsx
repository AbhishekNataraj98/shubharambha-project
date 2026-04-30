import { Text, TouchableOpacity, View } from 'react-native'
import { type DetailTab } from '@/components/project-detail/types'

const BRAND = '#D85A30'
const BORDER = '#E0D5CC'
const FG = '#1A1A1A'
const MUTED = '#7A6F66'

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: '#FEF3C7', fg: '#92400E', label: 'Awaiting Contractor' },
  on_hold: { bg: '#FEF3C7', fg: '#92400E', label: 'Awaiting Contractor' },
  active: { bg: '#D1FAE5', fg: '#065F46', label: 'In Progress' },
  completed: { bg: '#F2EDE8', fg: '#374151', label: 'Completed' },
  cancelled: { bg: '#FEE2E2', fg: '#991B1B', label: 'Cancelled' },
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
  const { projectName, address, city, status } = props
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
          marginHorizontal: 16,
          marginTop: 8,
          borderRadius: 16,
          backgroundColor: '#FFFFFF',
          padding: 12,
          borderWidth: 1,
          borderColor: BORDER,
          borderLeftWidth: 4,
          borderLeftColor: BRAND,
        }}
      >
        <View style={{ position: 'absolute', top: 12, right: 12 }}>
          <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: badge.bg }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: badge.fg }}>{badgeLabel}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '700', color: FG, paddingRight: 110 }} numberOfLines={2}>
          {projectName}
        </Text>
        <Text style={{ marginTop: 6, fontSize: 12, color: MUTED }}>
          📍 {address}, {city}
        </Text>
        {props.professionalName ? (
          props.onPressProfessional ? (
            <TouchableOpacity
              onPress={props.onPressProfessional}
              style={{ marginTop: 10, alignSelf: 'flex-start', borderRadius: 8, backgroundColor: '#FFF8F5', paddingHorizontal: 10, paddingVertical: 6 }}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND }}>
                {props.professionalRole === 'worker' ? 'Worker' : 'Contractor'}: {props.professionalName} (Tap to view profile/review)
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={{ marginTop: 10, alignSelf: 'flex-start', borderRadius: 8, backgroundColor: '#FFF8F5', paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND }}>
                {props.professionalRole === 'worker' ? 'Worker' : 'Contractor'}: {props.professionalName}
              </Text>
            </View>
          )
        ) : null}
        {props.onPressProjectImages ? (
          <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={props.onPressProjectImages}
              style={{
                borderRadius: 10,
                backgroundColor: BRAND,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>View Project Images</Text>
            </TouchableOpacity>
            {props.onPressProjectOverview ? (
              <TouchableOpacity
                onPress={props.onPressProjectOverview}
                style={{
                  borderRadius: 10,
                  backgroundColor: '#FBF0EB',
                  borderWidth: 1,
                  borderColor: '#FED7AA',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: BRAND }}>Project Overview</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

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
  return (
    <View
      style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#F2EDE8',
        paddingTop: 4,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
      }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab
        const label =
          tab === 'updates'
            ? 'Updates'
            : tab === 'payments'
              ? 'Payments'
              : tab === 'chat'
                ? 'Chat'
                : 'Reports'
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onTabChange(tab)}
            style={{
              flex: 1,
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderBottomWidth: active ? 2 : 0,
              borderBottomColor: BRAND,
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? BRAND : MUTED }}>{label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
