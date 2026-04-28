import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerSchema } from '@/lib/validations/auth'
import type { TablesInsert } from '@/types/supabase'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid registration details' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (existingUserError) {
      return NextResponse.json({ error: existingUserError.message }, { status: 400 })
    }

    if (existingUser) {
      return NextResponse.json({ redirectTo: '/dashboard' })
    }

    const form = parsed.data

    const userRow: TablesInsert<'users'> = {
      id: user.id,
      phone_number: user.phone ?? '',
      role: form.role,
      name: form.name,
      city: form.city,
      pincode: form.pincode,
      bio: form.bio || null,
      is_verified: true,
    }

    const { error: userInsertError } = await supabase.from('users').insert(userRow)

    if (userInsertError) {
      return NextResponse.json({ error: userInsertError.message }, { status: 400 })
    }

    if (form.role === 'contractor') {
      const contractorRow: TablesInsert<'contractor_profiles'> = {
        user_id: user.id,
        years_experience: form.years_experience ?? 0,
        specialization: form.specialisations ?? [],
      }

      const { error } = await supabase.from('contractor_profiles').insert(contractorRow)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    if (form.role === 'worker') {
      const workerRow = {
        user_id: user.id,
        skill_tags: form.trade ? [form.trade] : [],
        years_experience: form.years_experience ?? 0,
      } as unknown as TablesInsert<'worker_profiles'>

      const { error } = await supabase.from('worker_profiles').insert(workerRow)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    if (form.role === 'supplier') {
      const shopRow = {
        owner_id: user.id,
        name: form.shop_name!,
        address: form.shop_address!,
        city: form.city,
        phone_number: user.phone ?? null,
        category_tags: form.category_tags ?? [],
        is_active: true,
      } as unknown as TablesInsert<'shops'>

      const { error } = await supabase.from('shops').insert(shopRow)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true, redirectTo: '/dashboard' })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to create profile',
      },
      { status: 500 }
    )
  }
}
