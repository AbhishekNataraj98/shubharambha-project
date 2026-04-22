'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
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
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-sm">
        <div className="mb-12 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Image
              src="/brick-icon.jpg"
              alt="Shubharambha"
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <h1 className="text-3xl font-bold text-gray-900">Shubharambha</h1>
          </div>
          <p className="text-sm text-gray-500">Construction made transparent</p>
        </div>

        {step === 'phone' ? (
          // React Hook Form handlers are stable, but this rule misfires here.
          // eslint-disable-next-line react-hooks/refs
          <form onSubmit={phoneForm.handleSubmit(sendOtp)} className="space-y-6">
            <div>
              <label className="mb-3 block font-medium text-gray-900">
                Enter your mobile number
              </label>

              <div className="flex gap-2">
                <div className="flex items-center whitespace-nowrap rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 font-medium text-gray-600">
                  +91
                </div>
                <input
                  type="tel"
                  placeholder="Enter 10-digit number"
                  {...phoneInputRegistration}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-lg focus:border-transparent focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">We&apos;ll send a 6-digit code via SMS</p>
              {phoneForm.formState.errors.phoneNumber?.message ? (
                <p className="mt-2 text-xs text-red-600">
                  {phoneForm.formState.errors.phoneNumber.message}
                </p>
              ) : null}
            </div>

            {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

            <Button
              type="submit"
              disabled={!phoneForm.formState.isValid || isLoading}
              className="w-full rounded-lg bg-orange-600 py-3 font-semibold text-white hover:bg-orange-700"
            >
              {isLoading ? 'Sending...' : 'Send OTP'}
            </Button>
          </form>
        ) : (
          <form onSubmit={otpForm.handleSubmit(verifyOtp)} className="space-y-6">
            <div>
              <label className="mb-4 block font-medium text-gray-900">
                Enter the OTP sent to {maskedPhone}
              </label>
              <div className="mb-4 flex justify-center gap-3">
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
                    className="h-12 w-12 rounded-lg border-2 border-gray-300 text-center text-xl font-semibold focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                  />
                ))}
              </div>

              <div className="mb-4 text-center text-sm text-gray-500">
                {timeLeft > 0 ? (
                  <span>Resend OTP in {formatTime(timeLeft)}</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="font-medium text-orange-600 hover:text-orange-700"
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              {otpForm.formState.errors.otp?.message ? (
                <p className="mt-2 text-xs text-red-600">{otpForm.formState.errors.otp.message}</p>
              ) : null}
            </div>

            {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

            <Button
              type="submit"
              disabled={!otpForm.formState.isValid || isLoading}
              className="w-full rounded-lg bg-orange-600 py-3 font-semibold text-white hover:bg-orange-700"
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
              className="w-full text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Change number
            </button>
          </form>
        )}

        <div className="mt-12 text-center">
          <p className="text-xs text-gray-500">
            By continuing you agree to our{' '}
            <a href="#" className="text-gray-700 underline hover:text-gray-900">
              Terms
            </a>
            {' & '}
            <a href="#" className="text-gray-700 underline hover:text-gray-900">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
