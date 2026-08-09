import { Users, FileStack, Timer } from 'lucide-react'
import { ClaimsGrid } from '@/components/claims/claims-grid'
import { RoleSwitcher } from '@/components/shell/role-switcher'
import { getSession } from '@/lib/session'
import { rowScopeFor, ROLE_SCOPE_HINT } from '@/lib/policy'
import { sql } from '@/lib/db'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function loadStats(scopeSql: string, params: unknown[]) {
  const rows = (await sql.query(
    `select
       count(*)::int as total,
       count(*) filter (where status in ('New','In Review','Awaiting Docs'))::int as open,
       count(*) filter (where updated_at > now() - interval '7 days')::int as recent
     from claims ${scopeSql}`,
    params,
  )) as { total: number; open: number; recent: number }[]
  return rows[0]
}

export default async function ClaimsPage() {
  const session = await getSession()
  if (!session) redirect('/signin')

  const scope = rowScopeFor(session)
  const scopeSql =
    scope.kind === 'team' ? 'where team_id = $1' : scope.kind === 'assigned' ? 'where assignee_id = $1' : ''
  const params = scope.kind === 'all' ? [] : [scope.kind === 'team' ? scope.teamId : scope.userId]

  const stats = await loadStats(scopeSql, params)

  return (
    <>
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.015em]">
            Hello {session.name.split(' ')[0]} 👋
          </h1>
          <p className="mt-0.5 text-[13.5px] text-nav">
            {ROLE_SCOPE_HINT[session.role]}
          </p>
        </div>
        <RoleSwitcher current={session.role} />
      </header>

      <section className="mb-7 grid gap-5 rounded-card bg-white p-5 shadow-[0_10px_60px_rgba(226,236,249,0.5)] sm:gap-6 sm:p-8 md:grid-cols-3">
        <Stat icon={FileStack} label="Claims in scope" value={stats.total} />
        <Stat icon={Timer} label="Open / in progress" value={stats.open} divider />
        <Stat icon={Users} label="Touched this week" value={stats.recent} divider />
      </section>

      <ClaimsGrid />
    </>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  divider,
}: {
  icon: typeof Users
  label: string
  value: number
  divider?: boolean
}) {
  return (
    <div className={divider ? 'md:border-l md:border-line md:pl-6' : ''}>
      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center sm:size-[72px] justify-center rounded-full bg-[linear-gradient(150deg,var(--color-ok-from),var(--color-ok-to))]">
          <Icon className="size-6 text-ok-ink sm:size-7" strokeWidth={1.6} />
        </span>
        <span>
          <span className="block text-[13px] text-nav">{label}</span>
          <span className="block text-[24px] font-bold tabular-nums sm:text-[28px] tracking-[-0.02em]">
            {value.toLocaleString()}
          </span>
        </span>
      </div>
    </div>
  )
}
