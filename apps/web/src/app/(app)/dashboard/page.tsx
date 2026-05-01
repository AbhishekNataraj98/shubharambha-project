import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/shared/bottom-nav'
import DashboardHome from '@/components/dashboard/dashboard-home'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('id,name,role,city').eq('id', user.id).maybeSingle()

  if (!profile) redirect('/register')

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F2EDE8' }}>
      <DashboardHome initialProfile={profile} />
      <BottomNav />
    </div>
  )
}
