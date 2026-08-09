'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Avatar } from '@/components/ui/primitives'
import type { Role } from '@/lib/policy'

type RoleOption = {
  role: Role
  label: string
  hint: string
  name: string
  hue: number
}

export function RolePicker({ roles }: { roles: RoleOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useState<Role | null>(null)

  async function signIn(role: Role) {
    setChosen(role)
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    startTransition(() => {
      router.push('/claims')
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {roles.map((r) => (
        <button
          key={r.role}
          onClick={() => signIn(r.role)}
          disabled={pending}
          className="group flex items-start gap-4 rounded-2xl border border-line bg-white p-5 text-left transition hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
        >
          <Avatar name={r.name} hue={r.hue} size={44} />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">
              {r.name}
            </span>
            <span className="block text-[13px] font-medium text-brand">
              {r.label}
            </span>
            <span className="mt-1 block text-[13px] leading-snug text-nav">
              {r.hint}
            </span>
          </span>
          {chosen === r.role && pending && (
            <span className="ml-auto text-[12px] text-muted">signing in…</span>
          )}
        </button>
      ))}
    </div>
  )
}
