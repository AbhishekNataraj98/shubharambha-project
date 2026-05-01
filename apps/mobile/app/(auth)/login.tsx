import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useRef } from 'react'
import { router } from 'expo-router'
import { KeyboardSafeView } from '@/lib/keyboardSafe'
import { supabase } from '@/lib/supabase'
import Logo from '@/components/shared/Logo'
import type { TextInput as TextInputType } from 'react-native'

const { width } = Dimensions.get('window')

export default function LoginScreen() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const otpRef = useRef<TextInputType>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCountdown() {
    setCountdown(45)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  async function sendOtp() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      Alert.alert(
        'Invalid number',
        'Please enter a valid 10-digit Indian mobile number'
      )
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      phone: `+91${digits}`,
    })
    setLoading(false)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setStep('otp')
    startCountdown()
    setTimeout(() => otpRef.current?.focus(), 400)
  }

  async function verifyOtp() {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP')
      return
    }
    setLoading(true)
    const digits = phone.replace(/\D/g, '')
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+91${digits}`,
      token: otp,
      type: 'sms',
    })
    if (error) {
      setLoading(false)
      Alert.alert('Error', 'Invalid or expired OTP. Please try again.')
      setOtp('')
      return
    }
    if (data.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('id, name')
        .eq('id', data.user.id)
        .maybeSingle()
      setLoading(false)
      if (!profile || !profile.name) {
        router.replace({ pathname: '/(auth)/register', params: { fromOtp: '1' } })
      } else {
        router.replace('/(app)/(tabs)')
      }
    }
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const phoneValid = phoneDigits.length === 10
  const otpValid = otp.length === 6

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardSafeView style={styles.flex} includeTopSafeArea={false}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo section */}
          <View style={styles.logoSection}>
            <View style={styles.logoBox}>
              <Logo size={44} color="white" />
            </View>
            <Text style={styles.appName}>Shubharambha</Text>
            <Text style={styles.tagline}>Construction made transparent</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            {step === 'phone' ? (
              <>
                <Text style={styles.heading}>Welcome back</Text>
                <Text style={styles.subheading}>
                  We will send a one-time code to verify your number.
                </Text>

                <Text style={styles.fieldLabel}>Phone number</Text>

                <View style={styles.phoneRow}>
                  <View style={styles.prefixBox}>
                    <Text style={styles.prefixText}>+91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="10-digit number"
                    placeholderTextColor="#C0BDB9"
                    keyboardType="number-pad"
                    maxLength={10}
                    value={phone}
                    onChangeText={setPhone}
                    returnKeyType="done"
                    onSubmitEditing={sendOtp}
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    !phoneValid && styles.primaryButtonDisabled,
                  ]}
                  onPress={sendOtp}
                  disabled={loading || !phoneValid}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send OTP</Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.termsText}>
                  By continuing you agree to our{' '}
                  <Text style={styles.termsLink}>Terms</Text>
                  {' & '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.heading}>Enter OTP</Text>
                <Text style={styles.subheading}>
                  Sent to +91 {phone}
                </Text>

                <TextInput
                  ref={otpRef}
                  style={styles.otpInput}
                  placeholder="------"
                  placeholderTextColor="#C0BDB9"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  returnKeyType="done"
                  onSubmitEditing={verifyOtp}
                  autoFocus
                />

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    !otpValid && styles.primaryButtonDisabled,
                  ]}
                  onPress={verifyOtp}
                  disabled={loading || !otpValid}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Verify & Continue
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.resendRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setStep('phone')
                      setOtp('')
                    }}
                  >
                    <Text style={styles.changeNumber}>Change number</Text>
                  </TouchableOpacity>

                  {countdown > 0 ? (
                    <Text style={styles.countdown}>
                      Resend in 0:{countdown.toString().padStart(2, '0')}
                    </Text>
                  ) : (
                    <TouchableOpacity onPress={sendOtp} disabled={loading}>
                      <Text style={styles.resendLink}>Resend OTP</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardSafeView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    alignItems: 'center',
  },

  // Logo
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#D85A30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#D85A30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2C2C2A',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: '#D85A30',
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Card
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#2C2C2A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2C2C2A',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: '#78716C',
    marginBottom: 24,
    lineHeight: 20,
  },

  // Phone input
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#44403C',
    marginBottom: 8,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  prefixBox: {
    backgroundColor: '#D85A30',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  prefixText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  phoneInput: {
    flex: 1,
    height: 54,
    backgroundColor: '#EDE8E3',
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#2C2C2A',
    fontWeight: '500',
    borderWidth: 1.5,
    borderColor: '#E7E5E4',
    letterSpacing: 1.5,
  },

  // OTP input
  otpInput: {
    width: '100%',
    height: 72,
    backgroundColor: '#EDE8E3',
    borderRadius: 16,
    fontSize: 36,
    fontWeight: '700',
    color: '#2C2C2A',
    textAlign: 'center',
    letterSpacing: 12,
    borderWidth: 1.5,
    borderColor: '#E7E5E4',
    marginBottom: 20,
  },

  // Button
  primaryButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#D85A30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#D85A30',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryButtonDisabled: {
    backgroundColor: '#D6D3D1',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Resend row
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  changeNumber: {
    fontSize: 14,
    color: '#78716C',
  },
  countdown: {
    fontSize: 14,
    color: '#A8A29E',
  },
  resendLink: {
    fontSize: 14,
    color: '#D85A30',
    fontWeight: '600',
  },

  // Terms
  termsText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#A8A29E',
    lineHeight: 18,
    marginTop: 4,
  },
  termsLink: {
    color: '#D85A30',
    fontWeight: '500',
  },
})
