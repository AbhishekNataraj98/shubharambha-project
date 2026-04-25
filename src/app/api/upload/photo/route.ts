import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { createClient } from '@/lib/supabase/server'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  const valuesLookLikePlaceholders =
    [cloudName, apiKey, apiSecret].some(
      (value) => !value || value.startsWith('your_') || value.includes('placeholder')
    )
  const hasCloudinaryConfig =
    Boolean(cloudName) &&
    Boolean(apiKey) &&
    Boolean(apiSecret) &&
    !valuesLookLikePlaceholders
  if (!hasCloudinaryConfig) {
    return NextResponse.json(
      { error: 'Cloudinary is not configured. Add real CLOUDINARY_* values in .env.local' },
      { status: 400 }
    )
  }

  const folder = formData.get('folder')
  const targetFolder =
    typeof folder === 'string' && folder.trim() !== '' ? folder.trim() : 'shubharambha/updates'

  try {
    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: targetFolder,
          quality: 'auto',
          fetch_format: 'auto',
          width: 1200,
          crop: 'limit',
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Upload failed'))
            return
          }
          resolve({ secure_url: result.secure_url })
        }
      )
      stream.end(buffer)
    })

    return NextResponse.json({ url: uploadResult.secure_url })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
