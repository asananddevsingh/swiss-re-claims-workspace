'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ROLES, ROLE_LABELS, type Role } from '@/lib/policy'

/**
 * Re-issues the session cookie with a different role. Present so the access
 * model can be exercised without four logins — the server re-evaluates policy
 * on the next request either way.
 */
export function RoleSwitcher({ current }: { current: Role }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pending, startTransition] = useTransition()

  async function switchTo(role: Role) {
    if (role === current) return
    await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    await queryClient.invalidateQueries()
    startTransition(() => router.refresh())
  }

  return (
    <label className="flex items-center gap-2 rounded-field border border-line bg-white px-3 py-2 text-[13px]">
      <span className="text-muted">Viewing as</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => switchTo(e.target.value as Role)}
        className="cursor-pointer bg-transparent font-semibold text-ink focus:outline-none"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  )
}
