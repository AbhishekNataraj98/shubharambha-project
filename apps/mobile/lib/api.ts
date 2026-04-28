import { supabase } from '@/lib/supabase'
import { getResolvedApiBaseUrl } from '@/lib/getApiBaseUrl'

function apiBase(): string {
  return getResolvedApiBaseUrl()
}

async function authHeaderBearer(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? ''
  return { Authorization: `Bearer ${token}` }
}

async function authHeaderJson(): Promise<HeadersInit> {
  const base = await authHeaderBearer()
  return { ...base, 'Content-Type': 'application/json' }
}

async function parseJsonError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const response = await fetch(`${apiBase()}${normalized}`, {
    headers: await authHeaderBearer(),
  })
  if (!response.ok) {
    throw new Error(await parseJsonError(response))
  }
  return response.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const response = await fetch(`${apiBase()}${normalized}`, {
    method: 'POST',
    headers: await authHeaderJson(),
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await parseJsonError(response))
  }
  return response.json() as Promise<T>
}

export async function apiPostNoJsonBody(path: string): Promise<Response> {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return fetch(`${apiBase()}${normalized}`, {
    method: 'POST',
    headers: await authHeaderBearer(),
  })
}

export async function apiDelete(path: string): Promise<void> {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const response = await fetch(`${apiBase()}${normalized}`, {
    method: 'DELETE',
    headers: await authHeaderBearer(),
  })
  if (!response.ok) {
    throw new Error(await parseJsonError(response))
  }
}

/** Mark-all-read returns a redirect on web; treat 3xx as success. */
export async function apiPostMarkAllNotificationsRead(): Promise<void> {
  const response = await apiPostNoJsonBody('/api/notifications/mark-all-read')
  if (response.ok || (response.status >= 300 && response.status < 400)) return
  throw new Error(await parseJsonError(response))
}
