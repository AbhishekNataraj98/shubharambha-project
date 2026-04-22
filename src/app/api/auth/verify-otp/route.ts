import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyOtpSchema } from '@/lib/validations/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = verifyOtpSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: `+91${parsed.data.phoneNumber}`,
      token: parsed.data.otp,
      type: 'sms',
    })

    if (verifyError) {
      return NextResponse.json({ error: verifyError.message }, { status: 401 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Unable to resolve user after OTP verification' }, { status: 500 })
    }

    const { data: existingUser, error: userLookupError } = await supabase
      .from('users')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle()

    if (userLookupError) {
      return NextResponse.json({ error: userLookupError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      redirectTo: existingUser ? '/dashboard' : '/register',
    })
  } catch (error) {
    console.error('verify-otp route failed:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to verify OTP due to server error',
      },
      { status: 500 }
    )
  }
}
