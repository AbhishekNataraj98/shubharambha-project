import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { createClient } from '@/lib/supabase/server'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

function getCloudinaryPublicId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('cloudinary.com')) return null
    const marker = '/upload/'
    const uploadIdx = parsed.pathname.indexOf(marker)
    if (uploadIdx < 0) return null
    let remainder = parsed.pathname.slice(uploadIdx + marker.length)
    if (remainder.startsWith('v')) {
      const slash = remainder.indexOf('/')
      if (slash >= 0) remainder = remainder.slice(slash + 1)
    }
    const withoutExt = remainder.replace(/\.[^.\/]+$/, '')
    return withoutExt || null
  } catch {
    return null
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageId } = await params
  const { data: image, error: findError } = await (supabase as any)
    .from('professional_images')
    .select('id,professional_id,image_url')
    .eq('id', imageId)
    .maybeSingle()
  if (findError || !image) return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  if (image.professional_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await (supabase as any).from('professional_images').delete().eq('id', imageId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const publicId = getCloudinaryPublicId(String(image.image_url ?? ''))
  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId)
    } catch {
      // Non-blocking cleanup.
    }
  }

  return NextResponse.json({ success: true })
}
