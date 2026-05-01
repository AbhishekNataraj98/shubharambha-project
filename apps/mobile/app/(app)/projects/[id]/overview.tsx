import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSessionState } from '@/lib/auth-state'
import { apiGet, apiPost } from '@/lib/api'

type StageRow = {
  stageKey: string
  floorIndex: number
  stageLabel: string
  estimate: number
  low: number
  high: number
  sr: number
  actual: number
}

type OverviewPayload = {
  rows?: Array<{ stageKey: string; floorIndex: number; stageLabel: string; actualCost: number }>
}

const BRAND = '#D85A30'

const PRE_STAGES = [
  { key: 'earthwork', label: 'Earthwork & excavation', weight: 4 },
  { key: 'footing', label: 'Footing', weight: 6 },
  { key: 'foundation', label: 'Foundation', weight: 7 },
  { key: 'plinth', label: 'Plinth beam', weight: 4 },
  { key: 'backfilling', label: 'Backfilling', weight: 3 },
] as const

const FLOOR_LOOP = [
  { key: 'brickwork', label: 'Brickwork', weight: 7 },
  { key: 'lintels', label: 'Lintels', weight: 3 },
  { key: 'doors_windows', label: 'Doors & windows', weight: 5 },
  { key: 'rcc_slab_beam', label: 'RCC slab + beam', weight: 8 },
] as const

const POST_STAGES = [
  { key: 'tile_laying', label: 'Tile laying (flooring)', weight: 7 },
  { key: 'electrical', label: 'Electrical works', weight: 6 },
  { key: 'plumbing', label: 'Plumbing', weight: 5 },
  { key: 'plastering', label: 'Plastering', weight: 6 },
  { key: 'paint', label: 'Painting', weight: 5 },
  { key: 'compound', label: 'Compound wall work', weight: 4 },
  { key: 'wood_polish', label: 'Wood polish', weight: 3 },
  { key: 'final_fittings', label: 'Final fittings', weight: 4 },
  { key: 'gate_railings', label: 'Gate & railings', weight: 3 },
] as const

const TIER_BANDS = {
  low: { label: 'Low', min: 1800, max: 2200, reference: 2000 },
  medium: { label: 'Medium', min: 2200, max: 2800, reference: 2500 },
  high: { label: 'High', min: 3000, max: 4500, reference: 3600 },
} as const

type TierKey = keyof typeof TIER_BANDS

const MATERIAL_INPUTS = [
  { key: 'cement', qtyPerSqft: 0.36, low: 360, mid: 395, high: 430 },
  { key: 'steel', qtyPerSqft: 4.1, low: 48, mid: 52, high: 56 },
  { key: 'brick', qtyPerSqft: 7.5, low: 5, mid: 6.5, high: 8 },
  { key: 'sandAgg', qtyPerSqft: 0.06, low: 6500, mid: 7600, high: 9000 },
  { key: 'labour', qtyPerSqft: 1, low: 320, mid: 420, high: 560 },
  { key: 'finishing', qtyPerSqft: 1, low: 420, mid: 640, high: 980 },
] as const

const SR_ITEMS = [
  { item: 'Earthwork excavation', srRate: 280, qtyPer1000Sqft: 45 },
  { item: 'RCC footing + pedestals', srRate: 8200, qtyPer1000Sqft: 15 },
  { item: 'RCC slabs & beams', srRate: 8800, qtyPer1000Sqft: 18 },
  { item: 'Brickwork 230mm', srRate: 5200, qtyPer1000Sqft: 55 },
  { item: 'TMT steel Fe-500', srRate: 72000, qtyPer1000Sqft: 4.2 },
  { item: 'Plastering int/ext', srRate: 202, qtyPer1000Sqft: 560 },
  { item: 'Electrical points', srRate: 1800, qtyPer1000Sqft: 55 },
] as const

const ROOM_PRESETS = [
  { name: 'Living Room', length: 14, width: 12, factor: 1 },
  { name: 'Master Bedroom', length: 13, width: 11, factor: 1.05 },
  { name: 'Bedroom 2', length: 12, width: 10, factor: 0.98 },
  { name: 'Kitchen', length: 10, width: 9, factor: 1.15 },
  { name: 'Bathrooms (2)', length: 13, width: 5, factor: 1.22 },
] as const

function formatINR(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function cumulativeSeries(values: number[]) {
  const output: number[] = []
  let running = 0
  for (const value of values) {
    running += value
    output.push(running)
  }
  return output
}

function getMaterialTotals(areaSqft: number) {
  return MATERIAL_INPUTS.reduce(
    (acc, item) => {
      const qty = item.qtyPerSqft * areaSqft
      acc.low += qty * item.low
      acc.mid += qty * item.mid
      acc.high += qty * item.high
      return acc
    },
    { low: 0, mid: 0, high: 0 }
  )
}

function getSrTotal(areaSqft: number, overheadPct: number, gstPct: number) {
  const base = SR_ITEMS.reduce((sum, item) => sum + item.srRate * item.qtyPer1000Sqft * (areaSqft / 1000), 0)
  return base * (1 + overheadPct / 100 + gstPct / 100)
}

function buildPlan(
  areaSqft: number,
  costPerSqft: number,
  floors: number,
  tier: TierKey,
  srOverheadPct: number,
  srGstPct: number
) {
  const list: Array<{ stageKey: string; floorIndex: number; stageLabel: string; weight: number }> = []
  PRE_STAGES.forEach((stage) => list.push({ stageKey: stage.key, floorIndex: 0, stageLabel: stage.label, weight: stage.weight }))
  for (let f = 1; f <= floors; f += 1) {
    FLOOR_LOOP.forEach((stage) =>
      list.push({
        stageKey: `${stage.key}_f${f}`,
        floorIndex: f,
        stageLabel: `${stage.label}${floors > 1 ? ` (F${f})` : ''}`,
        weight: stage.weight,
      })
    )
  }
  POST_STAGES.forEach((stage) => list.push({ stageKey: stage.key, floorIndex: floors, stageLabel: stage.label, weight: stage.weight }))

  const totalBudget = areaSqft * costPerSqft
  const materialTotals = getMaterialTotals(areaSqft)
  const tierBand = TIER_BANDS[tier]
  const lowTotal = Math.max(materialTotals.low, areaSqft * tierBand.min)
  const highTotal = Math.max(materialTotals.high, areaSqft * tierBand.max)
  const srTotal = getSrTotal(areaSqft, srOverheadPct, srGstPct)
  const totalWeight = list.reduce((sum, stage) => sum + stage.weight, 0)
  return {
    totalBudget,
    lowTotal,
    highTotal,
    srTotal,
    materialTotals,
    rows: list.map((stage) => ({
      stageKey: stage.stageKey,
      floorIndex: stage.floorIndex,
      stageLabel: stage.stageLabel,
      estimate: totalWeight > 0 ? (totalBudget * stage.weight) / totalWeight : 0,
      low: totalWeight > 0 ? (lowTotal * stage.weight) / totalWeight : 0,
      high: totalWeight > 0 ? (highTotal * stage.weight) / totalWeight : 0,
      sr: totalWeight > 0 ? (srTotal * stage.weight) / totalWeight : 0,
      actual: 0,
    })),
  }
}

export default function ProjectOverviewScreen() {
  const { id: rawProjectId } = useLocalSearchParams<{ id: string }>()
  const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId
  const { user, profile, loading } = useSessionState()
  const [areaSqft, setAreaSqft] = useState('1800')
  const [costPerSqft, setCostPerSqft] = useState('2000')
  const [floors, setFloors] = useState('2')
  const [tier, setTier] = useState<TierKey>('medium')
  const [srOverheadPct, setSrOverheadPct] = useState('18')
  const [srGstPct, setSrGstPct] = useState('5')
  const [activeTab, setActiveTab] = useState<'market' | 'sr' | 'building' | 'tracking'>('market')
  const [roomInputs, setRoomInputs] = useState(() =>
    ROOM_PRESETS.map((room) => ({ length: String(room.length), width: String(room.width) }))
  )
  const [savedActuals, setSavedActuals] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const numericArea = Math.max(1, Number(areaSqft) || 1)
  const numericCost = Math.max(1, Number(costPerSqft) || 1)
  const numericFloors = Math.max(1, Math.min(10, Number(floors) || 1))
  const numericOverhead = Math.max(0, Number(srOverheadPct) || 0)
  const numericGst = Math.max(0, Number(srGstPct) || 0)

  const { totalBudget, lowTotal, highTotal, srTotal, rows } = useMemo(() => {
    const plan = buildPlan(numericArea, numericCost, numericFloors, tier, numericOverhead, numericGst)
    return {
      totalBudget: plan.totalBudget,
      lowTotal: plan.lowTotal,
      highTotal: plan.highTotal,
      srTotal: plan.srTotal,
      rows: plan.rows.map((row) => ({
        ...row,
        actual: savedActuals[row.stageKey] ?? 0,
      })),
    }
  }, [numericArea, numericCost, numericFloors, tier, numericOverhead, numericGst, savedActuals])

  const estimatedTotal = rows.reduce((sum, row) => sum + row.estimate, 0)
  const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0)
  const variance = actualTotal - estimatedTotal
  const stageCodes = rows.map((_, index) => `S${index + 1}`)

  const loadActuals = useCallback(async () => {
    if (!projectId) return
    try {
      const payload = await apiGet<OverviewPayload>(`/api/projects/${projectId}/overview`)
      const map: Record<string, number> = {}
      for (const row of payload.rows ?? []) map[row.stageKey] = Number(row.actualCost ?? 0)
      setSavedActuals(map)
    } catch (error) {
      Alert.alert('Project overview', error instanceof Error ? error.message : 'Failed to load overview data')
    }
  }, [projectId])

  useEffect(() => {
    void loadActuals()
  }, [loadActuals])

  if (loading) return null
  if (!user) return <Redirect href="/(auth)/login" />
  if (!profile || !projectId) return <Redirect href="/(app)/(tabs)" />

  const onChangeActual = (stageKey: string, value: string) => {
    const num = Number(value.replace(/[^\d]/g, ''))
    setSavedActuals((prev) => ({ ...prev, [stageKey]: Number.isFinite(num) ? num : 0 }))
  }

  const onChangeRoomInput = (index: number, key: 'length' | 'width', value: string) => {
    const cleaned = value.replace(/[^\d]/g, '')
    setRoomInputs((prev) => prev.map((room, idx) => (idx === index ? { ...room, [key]: cleaned } : room)))
  }

  const onSave = async () => {
    setSaving(true)
    try {
      await apiPost(`/api/projects/${projectId}/overview`, {
        rows: rows.map((row) => ({
          stageKey: row.stageKey,
          floorIndex: row.floorIndex,
          stageLabel: row.stageLabel,
          actualCost: row.actual,
        })),
      })
      Alert.alert('Saved', 'Project overview actuals saved successfully.')
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to save overview data.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F7F5' }} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>Project Overview</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              ['market', 'Market'],
              ['sr', 'PWD SR'],
              ['building', 'Building'],
              ['tracking', 'Tracker'],
            ].map(([key, label]) => (
              <TouchableOpacity
                key={key}
                onPress={() => setActiveTab(key as typeof activeTab)}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  backgroundColor: activeTab === key ? BRAND : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: activeTab === key ? BRAND : '#E5E7EB',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: activeTab === key ? '#FFFFFF' : '#374151' }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View
          style={{
            marginTop: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#FED7AA',
            backgroundColor: '#FFF8F3',
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#374151' }}>Project Parameters</Text>
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
            <SelectMetric
              label="Tier"
              value={tier}
              onChange={(value) => {
                const next = value as TierKey
                setTier(next)
                setCostPerSqft(String(TIER_BANDS[next].reference))
              }}
              options={[
                { label: 'Low', value: 'low' },
                { label: 'Medium', value: 'medium' },
                { label: 'High', value: 'high' },
              ]}
            />
            <MetricInput label="SR overhead %" value={srOverheadPct} onChange={setSrOverheadPct} />
            <MetricInput label="SR GST %" value={srGstPct} onChange={setSrGstPct} />
          </View>
          <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
            <MetricInput label="Cost / sqft" value={costPerSqft} onChange={setCostPerSqft} />
            <MetricInput label="Area (sqft)" value={areaSqft} onChange={setAreaSqft} />
            <MetricInput label="Floors" value={floors} onChange={setFloors} />
          </View>
        </View>

        <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
          <KpiCard title="Est. Budget" value={formatINR(totalBudget)} tint="#EFF6FF" border="#BFDBFE" text="#1E3A8A" />
          <KpiCard title="Actual Spent" value={formatINR(actualTotal)} tint="#FFF7ED" border="#FED7AA" text="#9A3412" />
          <KpiCard
            title="Variance"
            value={`${variance >= 0 ? '+' : '-'}${formatINR(Math.abs(variance))}`}
            tint={variance > 0 ? '#FEF2F2' : variance < 0 ? '#ECFDF5' : '#F8FAFC'}
            border={variance > 0 ? '#FECACA' : variance < 0 ? '#BBF7D0' : '#E2E8F0'}
            text={variance > 0 ? '#B91C1C' : variance < 0 ? '#166534' : '#334155'}
          />
        </View>

        {activeTab === 'market' ? (
          <>
            <View style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>Cost Projection Timeline</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <LegendDot color="#93C5FD" label="Stage" />
                  <LegendDot color="#1D4ED8" label="Cumulative" />
                </View>
              </View>
              <SimpleChart
                rows={rows.map((r, index) => ({ label: stageCodes[index], value: r.estimate }))}
                color="#93C5FD"
                cumulativeColor="#1D4ED8"
              />
              <Text style={{ marginTop: 6, fontSize: 11, color: '#6B7280' }}>Range band: {formatINR(lowTotal)} to {formatINR(highTotal)}</Text>
            </View>

            <View style={{ marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>Actual vs Estimated</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <LegendDot color="#BFDBFE" label="Est." />
                  <LegendDot color={BRAND} label="Actual" />
                  <LegendDot color="#059669" label="Cum." />
                </View>
              </View>
              <SimpleDualChart rows={rows} labels={stageCodes} />
            </View>
          </>
        ) : null}

        {activeTab === 'sr' ? (
          <View style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', padding: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>PWD SR rate / sqft</Text>
            <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
              SR total: {formatINR(srTotal)} ({formatINR(srTotal / numericArea)} per sqft)
            </Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: '#6B7280' }}>Market premium: {formatINR(totalBudget - srTotal)}</Text>
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: '#F2EDE8', borderRadius: 10 }}>
              {SR_ITEMS.map((item) => (
                <View key={item.item} style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: '#F2EDE8' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>{item.item}</Text>
                  <Text style={{ fontSize: 11, color: '#6B7280' }}>
                    SR {formatINR(item.srRate)} · Qty/1000 sqft {item.qtyPer1000Sqft}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {activeTab === 'building' ? (
          <View style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', padding: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Individual Building Estimation</Text>
            {ROOM_PRESETS.map((room, index) => {
              const length = Math.max(1, Number(roomInputs[index]?.length) || room.length)
              const width = Math.max(1, Number(roomInputs[index]?.width) || room.width)
              const area = length * width
              return (
                <View key={room.name} style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F8FAFC', padding: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{room.name}</Text>
                  <View style={{ marginTop: 6, flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ marginBottom: 4, fontSize: 10, fontWeight: '700', color: '#6B7280' }}>Length (ft)</Text>
                      <TextInput
                        value={roomInputs[index]?.length ?? String(room.length)}
                        onChangeText={(text) => onChangeRoomInput(index, 'length', text)}
                        keyboardType="number-pad"
                        style={{
                          minHeight: 34,
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          backgroundColor: '#FFFFFF',
                          fontSize: 12,
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ marginBottom: 4, fontSize: 10, fontWeight: '700', color: '#6B7280' }}>Width (ft)</Text>
                      <TextInput
                        value={roomInputs[index]?.width ?? String(room.width)}
                        onChangeText={(text) => onChangeRoomInput(index, 'width', text)}
                        keyboardType="number-pad"
                        style={{
                          minHeight: 34,
                          borderWidth: 1,
                          borderColor: '#E5E7EB',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          backgroundColor: '#FFFFFF',
                          fontSize: 12,
                        }}
                      />
                    </View>
                  </View>
                  <Text style={{ marginTop: 6, fontSize: 11, color: '#6B7280' }}>{area} sqft/floor · factor {room.factor}x</Text>
                  <Text style={{ marginTop: 4, fontSize: 12, color: '#0C4A6E' }}>
                    Market: {formatINR(area * numericFloors * numericCost * room.factor)}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: '#1E3A8A' }}>
                    PWD SR: {formatINR(area * numericFloors * (srTotal / numericArea) * room.factor)}
                  </Text>
                </View>
              )
            })}
          </View>
        ) : null}

        {activeTab === 'tracking' ? (
          <View style={{ marginTop: 14, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 2 }}>
              Stage-wise Tracking
            </Text>
            <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled stickyHeaderIndices={[0]}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: '#FFF7ED',
                  borderTopWidth: 1,
                  borderTopColor: '#FFEDD5',
                  borderBottomWidth: 1,
                  borderBottomColor: '#FFEDD5',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#9A3412' }}>Stage</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#9A3412' }}>Estimated</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#9A3412' }}>Actual / Status</Text>
              </View>
              {rows.map((row, index) => {
                const delta = row.actual - row.estimate
                return (
                  <View key={row.stageKey} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#F2EDE8' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ borderRadius: 8, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569' }}>{`S${index + 1}`}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' }}>{row.stageLabel}</Text>
                    </View>
                    <Text style={{ marginTop: 2, fontSize: 12, color: '#6B7280' }}>Estimated: {formatINR(row.estimate)} · SR: {formatINR(row.sr)}</Text>
                    <Text style={{ marginTop: 2, fontSize: 11, color: '#6B7280' }}>Range: {formatINR(row.low)} to {formatINR(row.high)}</Text>
                    <TextInput
                      placeholder="Enter actual amount"
                      keyboardType="number-pad"
                      value={row.actual ? String(Math.round(row.actual)) : ''}
                      onChangeText={(text) => onChangeActual(row.stageKey, text)}
                      style={{
                        marginTop: 6,
                        minHeight: 36,
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        fontSize: 13,
                      }}
                    />
                    <View style={{ marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, color: delta > 0 ? '#B91C1C' : delta < 0 ? '#166534' : '#6B7280' }}>
                        Var: {delta > 0 ? '+' : ''}
                        {formatINR(delta)}
                      </Text>
                      <View
                        style={{
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          backgroundColor: row.actual === 0 ? '#F2EDE8' : delta > 0 ? '#FEE2E2' : delta < 0 ? '#DCFCE7' : '#E5E7EB',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: row.actual === 0 ? '#6B7280' : delta > 0 ? '#B91C1C' : delta < 0 ? '#166534' : '#4B5563' }}>
                          {row.actual === 0 ? 'Pending' : delta > 0 ? 'Over budget' : delta < 0 ? 'Under budget' : 'On budget'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )
              })}
            </ScrollView>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => void onSave()}
          disabled={saving}
          style={{
            marginTop: 14,
            minHeight: 48,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: saving ? '#D1D5DB' : BRAND,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{saving ? 'Saving...' : 'Save Overview'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function MetricInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ marginBottom: 4, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^\d]/g, ''))}
        keyboardType="number-pad"
        style={{
          minHeight: 40,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          borderRadius: 10,
          paddingHorizontal: 10,
          backgroundColor: '#FFFFFF',
        }}
      />
    </View>
  )
}

function SelectMetric({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ label: string; value: string }>
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((opt) => opt.value === value)?.label ?? 'Select'
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ marginBottom: 4, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>{label}</Text>
      <View style={{ position: 'relative' }}>
        <TouchableOpacity
          onPress={() => setOpen((prev) => !prev)}
          style={{
            minHeight: 40,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            borderRadius: 10,
            paddingHorizontal: 10,
            backgroundColor: '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          activeOpacity={0.85}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{selected}</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {open ? (
          <View
            style={{
              position: 'absolute',
              top: 44,
              left: 0,
              right: 0,
              backgroundColor: '#FFFFFF',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              overflow: 'hidden',
              zIndex: 20,
              elevation: 4,
            }}
          >
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  backgroundColor: value === opt.value ? '#FFF7ED' : '#FFFFFF',
                  borderBottomWidth: 1,
                  borderBottomColor: '#F2EDE8',
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: value === opt.value ? '#9A3412' : '#374151' }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ height: open ? 132 : 0 }}>
        {open ? (
          <View />
        ) : null}
      </View>
    </View>
  )
}

function SimpleChart({
  rows,
  color,
  cumulativeColor,
}: {
  rows: Array<{ label: string; value: number }>
  color: string
  cumulativeColor: string
}) {
  const cumulative = cumulativeSeries(rows.map((r) => r.value))
  return (
    <LineChart
      labels={rows.map((row) => row.label)}
      series={[
        { color, values: rows.map((row) => row.value) },
        { color: cumulativeColor, values: cumulative },
      ]}
    />
  )
}

function SimpleDualChart({ rows, labels }: { rows: StageRow[]; labels: string[] }) {
  const cumulativeActual = cumulativeSeries(rows.map((r) => r.actual))
  return (
    <LineChart
      labels={labels}
      series={[
        { color: '#60A5FA', values: rows.map((row) => row.estimate) },
        { color: BRAND, values: rows.map((row) => row.actual) },
        { color: '#059669', values: cumulativeActual },
      ]}
    />
  )
}

function LineChart({
  labels,
  series,
}: {
  labels: string[]
  series: Array<{ color: string; values: number[] }>
}) {
  const chartHeight = 160
  const pointGap = 40
  const chartWidth = Math.max(360, Math.max(1, labels.length - 1) * pointGap + 20)
  const maxValue = Math.max(1, ...series.flatMap((item) => item.values))
  const getPoint = (value: number, index: number) => {
    const x = 10 + index * pointGap
    const y = chartHeight - (value / maxValue) * (chartHeight - 20) - 10
    return { x, y }
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ paddingVertical: 8 }}>
        <View style={{ width: chartWidth, height: chartHeight + 24, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: '#E5E7EB' }}>
          {series.map((item, sIdx) =>
            item.values.map((value, idx) => {
              const from = getPoint(value, idx)
              const to = idx < item.values.length - 1 ? getPoint(item.values[idx + 1], idx + 1) : null
              const line = to
                ? {
                    left: from.x,
                    top: from.y,
                    width: Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2),
                    transform: [{ rotate: `${Math.atan2(to.y - from.y, to.x - from.x)}rad` }],
                  }
                : null
              return (
                <View key={`${sIdx}_${idx}`}>
                  {line ? (
                    <View
                      style={{
                        position: 'absolute',
                        height: 2,
                        borderRadius: 2,
                        backgroundColor: item.color,
                        left: line.left,
                        top: line.top,
                        width: line.width,
                        transform: line.transform,
                      }}
                    />
                  ) : null}
                  <View
                    style={{
                      position: 'absolute',
                      left: from.x - 3,
                      top: from.y - 3,
                      width: 6,
                      height: 6,
                      borderRadius: 6,
                      backgroundColor: item.color,
                    }}
                  />
                </View>
              )
            })
          )}
        </View>
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          {labels.map((label, index) => (
            <Text key={`${label}_${index}`} style={{ width: pointGap, fontSize: 10, textAlign: 'center', color: '#6B7280' }}>
              {label}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  )
}

function KpiCard({
  title,
  value,
  tint,
  border,
  text,
}: {
  title: string
  value: string
  tint: string
  border: string
  text: string
}) {
  return (
    <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: tint, padding: 10 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#6B7280' }}>{title}</Text>
      <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '900', color: text }}>{value}</Text>
    </View>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: '#6B7280' }}>{label}</Text>
    </View>
  )
}
