import { NextResponse } from 'next/server'
import { z } from 'zod'
import { v2 as cloudinary } from 'cloudinary'
import { createClient } from '@/lib/supabase/server'

const contractorSchema = z.object({
  years_experience: z.number().int().min(0).max(80).optional(),
})

const workerSchema = z.object({
  years_experience: z.number().int().min(0).max(80).optional(),
})

const updateSchema = z.object({
  profile_photo_url: z.string().url().nullable().optional(),
  city: z.string().trim().min(2).max(80).nullable().optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .nullable()
    .optional(),
  bio: z.string().trim().max(600).nullable().optional(),
  contractor: contractorSchema.optional(),
  worker: workerSchema.optional(),
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

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

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return fail('Unauthorized', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON body')
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid payload')
  }

  const payload = parsed.data
  const { data: me } = await supabase
    .from('users')
    .select('role,profile_photo_url')
    .eq('id', user.id)
    .maybeSingle()
  if (!me) return fail('Profile not found', 404)

  const previousPhotoUrl = me.profile_photo_url

  const userUpdate: {
    bio?: string | null
    profile_photo_url?: string | null
    city?: string | null
    pincode?: string | null
  } = {}
  if (payload.bio !== undefined) userUpdate.bio = payload.bio
  if (payload.profile_photo_url !== undefined) userUpdate.profile_photo_url = payload.profile_photo_url
  if (payload.city !== undefined) userUpdate.city = payload.city
  if (payload.pincode !== undefined) userUpdate.pincode = payload.pincode

  if (Object.keys(userUpdate).length > 0) {
    const { error } = await supabase.from('users').update(userUpdate).eq('id', user.id)
    if (error) return fail(error.message)
  }

  if (payload.contractor) {
    if (me?.role !== 'contractor') return fail('Only contractors can update contractor profile fields', 403)
    const contractorUpdate: Record<string, unknown> = {}
    if (payload.contractor.years_experience !== undefined) contractorUpdate.years_experience = payload.contractor.years_experience
    if (Object.keys(contractorUpdate).length > 0) {
      const { error } = await supabase.from('contractor_profiles').update(contractorUpdate).eq('user_id', user.id)
      if (error) return fail(error.message)
    }
  }

  if (payload.worker) {
    if (me?.role !== 'worker') return fail('Only workers can update worker profile fields', 403)
    const workerUpdate: Record<string, unknown> = {}
    if (payload.worker.years_experience !== undefined) workerUpdate.years_experience = payload.worker.years_experience
    if (Object.keys(workerUpdate).length > 0) {
      const { error } = await supabase.from('worker_profiles').update(workerUpdate).eq('user_id', user.id)
      if (error) return fail(error.message)
    }
  }

  if (
    payload.profile_photo_url !== undefined &&
    previousPhotoUrl &&
    payload.profile_photo_url !== previousPhotoUrl
  ) {
    const publicId = getCloudinaryPublicId(previousPhotoUrl)
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId)
      } catch {
        // Non-blocking cleanup; profile update already succeeded.
      }
    }
  }

  return NextResponse.json({ success: true })
}

