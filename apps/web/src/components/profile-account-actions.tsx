'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ProfileAccountActions() {
  const supabase = createClient()
  const [deleting, setDeleting] = useState(false)

  const onDeleteAccount = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to delete your account? This action is permanent and cannot be undone.'
    )
    if (!confirmed) return

    try {
      setDeleting(true)
      const response = await fetch('/api/account', { method: 'DELETE' })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Unable to delete account')
      }
      await supabase.auth.signOut()
      window.location.href = '/login'
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete account'
      window.alert(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onDeleteAccount()}
      disabled={deleting}
      className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors hover:bg-red-50 disabled:opacity-60"
      style={{ border: '2px solid #DC2626', color: '#DC2626' }}
    >
      {deleting ? 'Deleting account...' : 'Delete account'}
    </button>
  )
}

