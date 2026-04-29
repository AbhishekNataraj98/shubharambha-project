import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { apiPost } from '@/lib/api'

type ScheduleItem = {
  stage: string
  label: string
  percentage: number
}

type FinancialSetupSheetProps = {
  visible: boolean
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

const DEFAULT_PAYMENT_SCHEDULE: ScheduleItem[] = [
  { stage: 'advance', label: 'Advance', percentage: 12 },
  { stage: 'plinth', label: 'After Plinth Work', percentage: 8 },
  { stage: 'brickwork', label: 'Brick Work Commencement', percentage: 2.5 },
  { stage: 'woodwork', label: 'Wood Work Commencement', percentage: 2.5 },
  { stage: 'gf_lintel', label: 'Before GF Lintel', percentage: 5 },
  { stage: 'gf_roof', label: 'Before GF Roof', percentage: 15 },
  { stage: 'ff_lintel', label: 'Before FF Lintel', percentage: 5 },
  { stage: 'ff_roof', label: 'Before FF Roof', percentage: 15 },
  { stage: 'sf_lintel', label: 'Before SF Lintel', percentage: 2.5 },
  { stage: 'sf_rcc', label: 'Before SF RCC', percentage: 5.5 },
  { stage: 'plastering', label: 'Before Plastering', percentage: 8 },
  { stage: 'flooring', label: 'Before Flooring', percentage: 8 },
  { stage: 'painting', label: 'Before Painting & Wiring', percentage: 8 },
  { stage: 'completion', label: 'Before Completion', percentage: 3 },
]

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function formatDisplayDate(date: Date | null): string {
  if (!date) return ''
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear())
  return `${day}/${month}/${year}`
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function FinancialSetupSheet({
  visible,
  projectId,
  onClose,
  onSuccess,
}: FinancialSetupSheetProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)

  const [totalContractAmount, setTotalContractAmount] = useState('')
  const [builtUpAreaSqft, setBuiltUpAreaSqft] = useState('')
  const [numberOfFloors, setNumberOfFloors] = useState<'G' | 'G+1' | 'G+2' | 'G+3'>('G+2')
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [expectedEndDate, setExpectedEndDate] = useState<Date | null>(null)
  const [activeDateField, setActiveDateField] = useState<'start' | 'end' | null>(null)

  const [agreedCementRate, setAgreedCementRate] = useState('400')
  const [agreedSteelRate, setAgreedSteelRate] = useState('65')
  const [escalationThresholdPercent, setEscalationThresholdPercent] = useState('10')

  const [paymentSchedule, setPaymentSchedule] = useState<ScheduleItem[]>(DEFAULT_PAYMENT_SCHEDULE)

  const scheduleTotal = useMemo(
    () => paymentSchedule.reduce((sum, row) => sum + Number(row.percentage || 0), 0),
    [paymentSchedule]
  )

  const totalAmountNumber = Number(totalContractAmount || 0)

  const handleSave = async () => {
    if (!totalAmountNumber || totalAmountNumber <= 0) {
      Alert.alert('Validation', 'Enter a valid contract amount')
      return
    }
    if (!Number(builtUpAreaSqft) || Number(builtUpAreaSqft) <= 0) {
      Alert.alert('Validation', 'Enter a valid built up area')
      return
    }
    if (!startDate || !expectedEndDate) {
      Alert.alert('Validation', 'Select start and expected completion dates')
      return
    }
    if (expectedEndDate.getTime() < startDate.getTime()) {
      Alert.alert('Validation', 'Expected completion date cannot be earlier than start date')
      return
    }
    if (Math.abs(scheduleTotal - 100) > 0.001) {
      Alert.alert('Validation', 'Payment schedule must total 100%')
      return
    }
    setSaving(true)
    try {
      const response = await apiPost<{ success?: boolean; error?: string }>(
        `/api/projects/${projectId}/financials/setup`,
        {
          total_contract_amount: totalAmountNumber,
          built_up_area_sqft: Number(builtUpAreaSqft),
          number_of_floors: numberOfFloors,
          start_date: toIsoDate(startDate),
          expected_end_date: toIsoDate(expectedEndDate),
          agreed_cement_rate: Number(agreedCementRate || 400),
          agreed_steel_rate: Number(agreedSteelRate || 65),
          escalation_threshold_percent: Number(escalationThresholdPercent || 10),
          payment_schedule: paymentSchedule,
        }
      )
      if (!response.success) {
        Alert.alert('Error', response.error ?? 'Failed to save')
        return
      }
      Alert.alert('Success', 'Financial plan saved!')
      onClose()
      onSuccess()
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Financial Setup</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.stepIndicator}>
            {(['Contract', 'Rates', 'Schedule'] as const).map((label, index) => {
              const stepNum = (index + 1) as 1 | 2 | 3
              const active = step >= stepNum
              return (
                <View key={label} style={styles.stepItem}>
                  <View style={[styles.stepCircle, active ? styles.stepCircleActive : styles.stepCircleInactive]}>
                    <Text style={active ? styles.stepCircleTextActive : styles.stepCircleTextInactive}>
                      {stepNum}
                    </Text>
                  </View>
                  <Text style={active ? styles.stepLabelActive : styles.stepLabelInactive}>{label}</Text>
                </View>
              )
            })}
          </View>

          {step === 1 ? (
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              keyboardShouldPersistTaps="handled"
              onTouchStart={() => setActiveDateField(null)}
            >
              <Text style={styles.fieldLabel}>Contract amount (₹)</Text>
              <View style={styles.amountWrap}>
                <Text style={styles.amountPrefix}>₹</Text>
                <TextInput
                  value={totalContractAmount}
                  onChangeText={setTotalContractAmount}
                  onFocus={() => setActiveDateField(null)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  style={styles.amountInput}
                />
              </View>

              <Text style={styles.fieldLabel}>Built up area (sqft)</Text>
              <TextInput
                value={builtUpAreaSqft}
                onChangeText={setBuiltUpAreaSqft}
                onFocus={() => setActiveDateField(null)}
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Number of floors</Text>
              <View style={styles.pillRow}>
                {(['G', 'G+1', 'G+2', 'G+3'] as const).map((floor) => (
                  <TouchableOpacity
                    key={floor}
                    onPress={() => {
                      setActiveDateField(null)
                      setNumberOfFloors(floor)
                    }}
                    style={[styles.pill, numberOfFloors === floor ? styles.pillActive : styles.pillInactive]}
                  >
                    <Text style={numberOfFloors === floor ? styles.pillTextActive : styles.pillTextInactive}>
                      {floor}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Start date (DD/MM/YYYY)</Text>
              <TouchableOpacity onPress={() => setActiveDateField('start')} style={styles.dateInput}>
                <Text style={startDate ? styles.dateText : styles.datePlaceholder}>
                  {startDate ? formatDisplayDate(startDate) : 'Select start date'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Expected completion (DD/MM/YYYY)</Text>
              <TouchableOpacity onPress={() => setActiveDateField('end')} style={styles.dateInput}>
                <Text style={expectedEndDate ? styles.dateText : styles.datePlaceholder}>
                  {expectedEndDate ? formatDisplayDate(expectedEndDate) : 'Select expected completion date'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}

          {step === 2 ? (
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              keyboardShouldPersistTaps="handled"
              onTouchStart={() => setActiveDateField(null)}
            >
              <Text style={styles.fieldLabel}>Agreed cement rate (₹/bag)</Text>
              <TextInput
                value={agreedCementRate}
                onChangeText={setAgreedCementRate}
                onFocus={() => setActiveDateField(null)}
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Agreed steel rate (₹/kg)</Text>
              <TextInput
                value={agreedSteelRate}
                onChangeText={setAgreedSteelRate}
                onFocus={() => setActiveDateField(null)}
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Escalation alert threshold (%)</Text>
              <TextInput
                value={escalationThresholdPercent}
                onChangeText={setEscalationThresholdPercent}
                onFocus={() => setActiveDateField(null)}
                keyboardType="number-pad"
                style={styles.input}
              />

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  If material prices rise above this %, the extra cost is typically payable by owner as per your agreement
                </Text>
              </View>
            </ScrollView>
          ) : null}

          {step === 3 ? (
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              keyboardShouldPersistTaps="handled"
              onTouchStart={() => setActiveDateField(null)}
            >
              <Text style={styles.sectionTitle}>Review payment schedule</Text>
              <Text style={styles.sectionSubtitle}>14 stages - must total 100%</Text>

              {paymentSchedule.map((item, index) => {
                const stageAmount = ((item.percentage || 0) / 100) * totalAmountNumber
                return (
                  <View key={item.stage} style={styles.scheduleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.scheduleLabel}>{item.label}</Text>
                      <Text style={styles.scheduleAmount}>{inr.format(stageAmount || 0)}</Text>
                    </View>
                    <TextInput
                      value={String(item.percentage)}
                      onChangeText={(text) => {
                        const next = [...paymentSchedule]
                        next[index] = { ...item, percentage: Number(text || 0) }
                        setPaymentSchedule(next)
                      }}
                      onFocus={() => setActiveDateField(null)}
                      keyboardType="decimal-pad"
                      style={styles.percentInput}
                    />
                  </View>
                )
              })}

              <Text style={[styles.totalText, Math.abs(scheduleTotal - 100) < 0.001 ? styles.totalOk : styles.totalBad]}>
                Total: {scheduleTotal.toFixed(1)}%
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setActiveDateField(null)
                  setPaymentSchedule(DEFAULT_PAYMENT_SCHEDULE)
                }}
              >
                <Text style={styles.resetLink}>Reset to standard</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => {
                setActiveDateField(null)
                setStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev))
              }}
              style={styles.backButton}
            >
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            {step < 3 ? (
              <TouchableOpacity
                onPress={() => {
                  setActiveDateField(null)
                  setStep((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : prev))
                }}
                style={styles.nextButton}
              >
                <Text style={styles.nextText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setActiveDateField(null)
                  void handleSave()
                }}
                disabled={saving || Math.abs(scheduleTotal - 100) > 0.001}
                style={[
                  styles.nextButton,
                  (saving || Math.abs(scheduleTotal - 100) > 0.001) && styles.nextButtonDisabled,
                ]}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.nextText}>Save financial plan</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
        {activeDateField ? (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={activeDateField === 'start' ? (startDate ?? new Date()) : (expectedEndDate ?? new Date())}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant="light"
              textColor="#111827"
              style={styles.datePicker}
              minimumDate={activeDateField === 'end' ? (startDate ?? undefined) : undefined}
              onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                if (Platform.OS !== 'ios') setActiveDateField(null)
                if (event.type === 'dismissed' || !selectedDate) return
                if (activeDateField === 'start') {
                  setStartDate(selectedDate)
                  if (expectedEndDate && expectedEndDate.getTime() < selectedDate.getTime()) {
                    setExpectedEndDate(selectedDate)
                  }
                }
                if (activeDateField === 'end') setExpectedEndDate(selectedDate)
              }}
            />
            {Platform.OS === 'ios' ? (
              <TouchableOpacity onPress={() => setActiveDateField(null)} style={styles.pickerDone}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '92%',
    minHeight: '70%',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  closeButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  closeText: { color: '#6B7280', fontWeight: '600' },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stepItem: { alignItems: 'center', flex: 1 },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: { backgroundColor: '#E8590C' },
  stepCircleInactive: { backgroundColor: '#E5E7EB' },
  stepCircleTextActive: { color: '#FFFFFF', fontWeight: '700' },
  stepCircleTextInactive: { color: '#6B7280', fontWeight: '700' },
  stepLabelActive: { marginTop: 4, fontSize: 11, color: '#E8590C', fontWeight: '600' },
  stepLabelInactive: { marginTop: 4, fontSize: 11, color: '#9CA3AF' },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingBottom: 16 },
  fieldLabel: { marginTop: 10, marginBottom: 6, fontSize: 13, fontWeight: '600', color: '#374151' },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 58,
  },
  amountPrefix: { fontSize: 20, color: '#E8590C', fontWeight: '700' },
  amountInput: { flex: 1, textAlign: 'center', fontSize: 24, fontWeight: '700', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  dateText: { color: '#111827', fontSize: 14, fontWeight: '500' },
  datePlaceholder: { color: '#9CA3AF', fontSize: 14 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: '#E8590C' },
  pillInactive: { backgroundColor: '#F3F4F6' },
  pillTextActive: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  pillTextInactive: { color: '#4B5563', fontWeight: '600', fontSize: 12 },
  infoBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 10,
    backgroundColor: '#FFF7ED',
    padding: 10,
  },
  infoText: { fontSize: 12, color: '#9A3412' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sectionSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 4, marginBottom: 8 },
  scheduleRow: {
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  scheduleLabel: { fontSize: 12, fontWeight: '700', color: '#111827' },
  scheduleAmount: { marginTop: 3, fontSize: 11, color: '#6B7280' },
  percentInput: {
    width: 68,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  totalText: { marginTop: 8, fontSize: 14, fontWeight: '700' },
  totalOk: { color: '#166534' },
  totalBad: { color: '#B91C1C' },
  resetLink: { marginTop: 8, fontSize: 12, color: '#E8590C', fontWeight: '600' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  backButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  backText: { color: '#4B5563', fontWeight: '700' },
  nextButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8590C',
  },
  nextButtonDisabled: { backgroundColor: '#D1D5DB' },
  nextText: { color: '#FFFFFF', fontWeight: '700' },
  pickerWrap: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  pickerDone: {
    alignSelf: 'flex-end',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  pickerDoneText: { color: '#E8590C', fontWeight: '700' },
  datePicker: {
    backgroundColor: '#FFFFFF',
  },
})
