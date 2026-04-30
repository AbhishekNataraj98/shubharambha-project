'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { phoneSchema } from '@/lib/validations/auth'

const phoneFormSchema = z.object({
  phoneNumber: phoneSchema,
})

const otpFormSchema = z.object({
  otp: z.string().trim().regex(/^\d{4,8}$/, 'Enter a valid OTP'),
})

type PhoneFormValues = z.infer<typeof phoneFormSchema>
type OtpFormValues = z.infer<typeof otpFormSchema>

export default function OtpLogin() {
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [timeLeft, setTimeLeft] = useState(45)
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phoneNumber: '' },
  })

  const otpForm = useForm<OtpFormValues>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: { otp: '' },
  })
  const phoneInputRegistration = phoneForm.register('phoneNumber', {
    onChange: (event) => {
      const cleaned = event.target.value.replace(/\D/g, '').slice(0, 10)
      phoneForm.setValue('phoneNumber', cleaned, { shouldValidate: true })
    },
  })

  useEffect(() => {
    if (step !== 'otp' || timeLeft === 0) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [step, timeLeft])

  const maskedPhone = useMemo(
    () => (phoneNumber ? `+91 XXXXXX${phoneNumber.slice(-4)}` : '+91 XXXXXX0000'),
    [phoneNumber]
  )

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...otpDigits]
    next[index] = value
    setOtpDigits(next)
    otpForm.setValue('otp', next.join(''), { shouldValidate: true })
    if (value && index < 5) otpInputRefs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  const sendOtp = async (values: PhoneFormValues) => {
    setIsLoading(true)
    setApiError(null)
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: values.phoneNumber }),
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setApiError(payload.error ?? 'Failed to send OTP')
        return
      }

      setPhoneNumber(values.phoneNumber)
      setStep('otp')
      setTimeLeft(45)
      setOtpDigits(['', '', '', '', '', ''])
      otpForm.reset({ otp: '' })
      setTimeout(() => otpInputRefs.current[0]?.focus(), 0)
    } catch {
      setApiError('Failed to send OTP')
    } finally {
      setIsLoading(false)
    }
  }

  const verifyOtp = async (values: OtpFormValues) => {
    setIsLoading(true)
    setApiError(null)
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, otp: values.otp }),
      })

      const payload = (await response.json()) as { error?: string; redirectTo?: string }
      if (!response.ok || !payload.redirectTo) {
        setApiError(payload.error ?? 'OTP verification failed')
        return
      }

      router.replace(payload.redirectTo)
      router.refresh()
    } catch {
      setApiError('OTP verification failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (timeLeft > 0 || !phoneNumber) return
    await sendOtp({ phoneNumber })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: '#F2EDE8' }}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-[22px] shadow-lg"
            style={{ backgroundColor: '#D85A30', boxShadow: '0 12px 28px rgba(216, 90, 48, 0.32)' }}
          >
            <img src="/icons/logo-white.svg" alt="Shubharambha logo" className="h-12 w-12" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Shubharambha</h1>
            <p className="mt-1 text-sm font-medium" style={{ color: '#D85A30' }}>Construction made transparent</p>
          </div>
        </div>

        {step === 'phone' ? (
          // React Hook Form handlers are stable, but this rule misfires here.
          // eslint-disable-next-line react-hooks/refs
          <form onSubmit={phoneForm.handleSubmit(sendOtp)} className="space-y-6">
            <div>
              <label className="mb-3 block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Enter your mobile number
              </label>

              <div className="flex gap-3">
                <div
                  className="flex items-center whitespace-nowrap rounded-lg px-4 py-3.5 font-semibold text-white"
                  style={{ backgroundColor: '#D85A30' }}
                >
                  +91
                </div>
                <input
                  type="tel"
                  placeholder="10-digit number"
                  {...phoneInputRegistration}
                  className="flex-1 rounded-lg border-2 px-4 py-3.5 text-base font-medium focus:outline-none transition-all"
                  style={{
                    borderColor: '#E0D5CC',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#D85A30'
                    e.target.style.boxShadow = '0 0 0 3px rgba(216, 90, 48, 0.12)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E0D5CC'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
              <p className="mt-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                We&apos;ll send a 6-digit code via SMS
              </p>
              {phoneForm.formState.errors.phoneNumber?.message ? (
                <p className="mt-2 text-xs font-medium text-red-600">
                  {phoneForm.formState.errors.phoneNumber.message}
                </p>
              ) : null}
            </div>

            {apiError ? (
              <p className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 bg-red-50">{apiError}</p>
            ) : null}

            <Button
              type="submit"
              disabled={!phoneForm.formState.isValid || isLoading}
              className="w-full rounded-lg py-3.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#D85A30' }}
            >
              {isLoading ? 'Sending...' : 'Send OTP'}
            </Button>
          </form>
        ) : (
          <form onSubmit={otpForm.handleSubmit(verifyOtp)} className="space-y-7">
            <div>
              <label className="mb-4 block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Enter the OTP sent to <span style={{ color: '#D85A30' }}>{maskedPhone}</span>
              </label>
              <div className="mb-6 flex justify-center gap-2.5">
                {otpDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpInputRefs.current[index] = el
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="h-14 w-14 rounded-lg border-2 text-center text-2xl font-bold transition-all focus:outline-none"
                    style={{
                      borderColor: digit ? '#D85A30' : '#E0D5CC',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#D85A30'
                      e.target.style.boxShadow = '0 0 0 3px rgba(216, 90, 48, 0.12)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = otpDigits[index] ? '#D85A30' : '#E0D5CC'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                ))}
              </div>

              <div className="mb-6 text-center text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                {timeLeft > 0 ? (
                  <span>Resend OTP in {formatTime(timeLeft)}</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="font-semibold transition-colors hover:opacity-80"
                    style={{ color: '#D85A30' }}
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              {otpForm.formState.errors.otp?.message ? (
                <p className="text-xs font-medium text-red-600">{otpForm.formState.errors.otp.message}</p>
              ) : null}
            </div>

            {apiError ? (
              <p className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 bg-red-50">{apiError}</p>
            ) : null}

            <Button
              type="submit"
              disabled={!otpForm.formState.isValid || isLoading}
              className="w-full rounded-lg py-3.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#D85A30' }}
            >
              {isLoading ? 'Verifying...' : 'Verify & Continue'}
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setApiError(null)
                setOtpDigits(['', '', '', '', '', ''])
                otpForm.reset({ otp: '' })
                setTimeLeft(45)
              }}
              className="w-full py-2 text-sm font-semibold transition-colors hover:opacity-80"
              style={{ color: '#D85A30' }}
            >
              Change number
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            By continuing you agree to our{' '}
            <a href="#" className="underline hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
              Terms
            </a>
            {' & '}
            <a href="#" className="underline hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
