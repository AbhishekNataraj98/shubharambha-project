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

  return (
    <div className="min-h-screen bg-[#F2EDE8]">
      <AppTopHeader userId={user?.id ?? null} />
      <div>{children}</div>
    </div>
  )
}
