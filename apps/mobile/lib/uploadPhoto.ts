import { supabase } from '@/lib/supabase'
import { getResolvedApiBaseUrl } from '@/lib/getApiBaseUrl'

export async function uploadPhotoToWebApi(params: { uri: string; name: string; type: string; folder?: string }) {
  const { uri, name, type, folder } = params
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')

  const form = new FormData()
  form.append('file', { uri, name, type } as unknown as Blob)
  if (folder) form.append('folder', folder)

  const response = await fetch(`${getResolvedApiBaseUrl()}/api/upload/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })

  const payload = (await response.json()) as { url?: string; error?: string }
  if (!response.ok) throw new Error(payload.error ?? 'Upload failed')
  if (!payload.url) throw new Error('Upload failed: missing url')
  return payload.url
}
