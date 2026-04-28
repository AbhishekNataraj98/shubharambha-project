import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_* fallbacks).'
  )
}

function createAuthStorage() {
  // Expo Web runs in a browser environment where expo-secure-store is not supported.
  if (Platform.OS === 'web') {
    return {
      getItem: async (key: string) => {
        try {
          if (typeof window === 'undefined') return null
          return window.localStorage.getItem(key)
        } catch {
          return null
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          if (typeof window === 'undefined') return
          window.localStorage.setItem(key, value)
        } catch {
          // Ignore quota / private mode errors.
        }
      },
      removeItem: async (key: string) => {
        try {
          if (typeof window === 'undefined') return
          window.localStorage.removeItem(key)
        } catch {
          // Ignore.
        }
      },
    }
  }

  // Native: keep tokens out of JS string heap as much as possible via SecureStore.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store')
  return {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: createAuthStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)