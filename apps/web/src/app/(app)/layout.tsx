import { createClient } from '@/lib/supabase/server'
import AppTopHeader from '@/components/shared/AppTopHeader'

export default async function AppGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('users').select('name').eq('id', user.id).maybeSingle()
    : { data: null as { name?: string } | null }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <AppTopHeader userId={user?.id ?? null} profileName={profile?.name} />
      <div>{children}</div>
    </div>
  )
}
