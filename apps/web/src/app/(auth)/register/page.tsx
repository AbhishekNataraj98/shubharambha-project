import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RegisterForm from '@/components/register-form'

export default async function RegisterPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (existingUser) {
      redirect('/dashboard')
    }
  }

  return <RegisterForm />
}
