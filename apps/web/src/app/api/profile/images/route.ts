import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_IMAGES = 6

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!me || (me.role !== 'contractor' && me.role !== 'worker')) {
    return NextResponse.json({ error: 'Only contractor/worker can access profile images' }, { status: 403 })
  }

  const { data, error } = await (supabase as any)
    .from('professional_images')
    .select('id,image_url,created_at')
    .eq('professional_id', user.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!me || (me.role !== 'contractor' && me.role !== 'worker')) {
    return NextResponse.json({ error: 'Only contractor/worker can upload profile images' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { image_url?: string }
  const imageUrl = String(body.image_url ?? '').trim()
  if (!imageUrl) return NextResponse.json({ error: 'image_url is required' }, { status: 400 })

  const { count } = await (supabase as any)
    .from('professional_images')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', user.id)
  if ((count ?? 0) >= MAX_IMAGES) {
    return NextResponse.json({ error: '6 images limit reached delete existing to upload new' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('professional_images')
    .insert({
      professional_id: user.id,
      image_url: imageUrl,
    })
    .select('id,image_url,created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, item: data })
}
