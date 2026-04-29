import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { STAGE_LABELS, STAGE_ORDER, type DetailTab, type StageKey } from '@/components/project-detail/types'

const BRAND = '#E8590C'
const BORDER = '#E0D5CC'
const FG = '#1A1A1A'
const MUTED = '#7A6F66'

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: '#FEF3C7', fg: '#92400E', label: 'Awaiting Contractor' },
  on_hold: { bg: '#FEF3C7', fg: '#92400E', label: 'Awaiting Contractor' },
  active: { bg: '#D1FAE5', fg: '#065F46', label: 'In Progress' },
  completed: { bg: '#F3F4F6', fg: '#374151', label: 'Completed' },
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
  contractorAssigned?: boolean
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  tabRowOnly?: boolean
  hideStageTracker?: boolean
  showReportsTab?: boolean
}

export function ProjectHeroAndStage(props: ProjectChromeProps) {
  const { projectName, address, city, status, currentStage } = props
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.completed
  const badgeLabel =
    status === 'pending' || status === 'on_hold'
      ? props.contractorAssigned
        ? 'Waiting contractor approval'
        : 'Waiting worker approval'
      : badge.label
  const currentStageIndex = STAGE_ORDER.indexOf(currentStage as StageKey)

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
          <TouchableOpacity
            onPress={props.onPressProjectImages}
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              borderRadius: 10,
              backgroundColor: BRAND,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>View Project Images</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!props.hideStageTracker ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 6,
            borderRadius: 14,
            backgroundColor: '#FFFFFF',
            paddingVertical: 8,
            paddingHorizontal: 6,
            borderWidth: 1,
            borderColor: BORDER,
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2 }}>
            {STAGE_ORDER.map((stage, index) => {
              const completed = index < currentStageIndex
              const current = index === currentStageIndex
              const lineToNextOrange = index < currentStageIndex
              return (
                <View key={stage} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ alignItems: 'center', width: 50 }}>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: completed || current ? BRAND : '#FFFFFF',
                        borderWidth: completed || current ? 0 : 2,
                        borderColor: BORDER,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {completed ? (
                        <Text style={{ color: '#FFFFFF', fontSize: 10 }}>✓</Text>
                      ) : current ? (
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#FFFFFF' }} />
                      ) : null}
                    </View>
                    <Text
                      numberOfLines={2}
                      style={{
                        marginTop: 3,
                        fontSize: 9,
                        textAlign: 'center',
                        color: completed || current ? BRAND : '#9CA3AF',
                        fontWeight: completed || current ? '600' : '400',
                        width: 50,
                      }}
                    >
                      {STAGE_LABELS[stage]}
                    </Text>
                  </View>
                  {index < STAGE_ORDER.length - 1 ? (
                    <View
                      style={{
                        width: 10,
                        height: 2,
                        marginTop: 11,
                        backgroundColor: lineToNextOrange ? BRAND : '#E5E7EB',
                      }}
                    />
                  ) : null}
                </View>
              )
            })}
          </ScrollView>
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
  return (
    <View
      style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
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
