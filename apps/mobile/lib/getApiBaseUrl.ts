import Constants from 'expo-constants'
import { Platform } from 'react-native'

function tryParseUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function devHostFromExpo(): string | null {
  const hostUri = Constants.expoConfig?.hostUri
  if (!hostUri) return null
  // Examples: "192.168.1.22:8081", "localhost:8081"
  const host = hostUri.split(':')[0]
  if (!host) return null
  if (host === 'localhost' || host === '127.0.0.1') return null
  return host
}

/**
 * Resolves the Next.js web API base URL for mobile dev.
 *
 * Common failure mode: EXPO_PUBLIC_API_URL=http://localhost:3000 works on simulators,
 * but fails on a physical device on the same Wi‑Fi. In dev, we rewrite localhost to the
 * Expo dev host LAN IP when available.
 */
export function getResolvedApiBaseUrl() {
  const raw = process.env.EXPO_PUBLIC_API_URL
  if (!raw) throw new Error('EXPO_PUBLIC_API_URL is not set')

  const trimmed = raw.replace(/\/$/, '')
  const url = tryParseUrl(trimmed)
  if (!url) throw new Error(`EXPO_PUBLIC_API_URL is invalid: ${raw}`)

  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (!__DEV__ || !isLocalhost) return trimmed

  // Web runs in the local browser; keep localhost for Next.js dev server.
  if (Platform.OS === 'web') return trimmed

  const lanHost = devHostFromExpo()
  if (!lanHost) return trimmed

  url.hostname = lanHost
  return url.toString().replace(/\/$/, '')
}
