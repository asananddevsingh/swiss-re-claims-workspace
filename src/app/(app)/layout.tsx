import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/shell/sidebar'
import { getSession, DEMO_USERS } from '@/lib/session'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const hue = DEMO_USERS[session.role].avatarHue

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: session.name, role: session.role, hue }} />
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-8 sm:py-7">{children}</main>
    </div>
  )
}
