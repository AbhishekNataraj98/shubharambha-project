import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendOtpSchema } from '@/lib/validations/auth'

function hasValidSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) return false
  if (url.includes('your_supabase_project_url')) return false
  if (anonKey.includes('your_supabase_anon_key')) return false

  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = sendOtpSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid phone number' },
        { status: 400 }
      )
    }

    if (!hasValidSupabaseEnv()) {
      return NextResponse.json(
        {
          error:
            'Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.',
        },
        { status: 500 }
      )
    }

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithOtp({
      phone: `+91${parsed.data.phoneNumber}`,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully',
    })
  } catch (error) {
    console.error('send-otp route failed:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to send OTP due to server error',
      },
      { status: 500 }
    )
  }
}
