import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { DocumentWorkspace } from '@/components/workspace/document-workspace'
import { StatusChip } from '@/components/ui/primitives'
import { getSession } from '@/lib/session'
import { claimInScope } from '@/lib/claims-query'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function ClaimWorkspace({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { id } = await params

  // Same scope rule as the grid. A claim outside the caller's scope is a 404,
  // not a 403 — an adjudicator should not learn that other queues exist.
  if (!(await claimInScope(session, id))) notFound()

  const rows = (await sql.query(
    `select c.id, c.claim_ref, c.claimant, c.insured, c.amount::float8 as amount,
            c.currency, c.status, c.channel, c.document_id, u.name as assignee_name
     from claims c left join users u on u.id = c.assignee_id
     where c.id = $1`,
    [id],
  )) as Record<string, unknown>[]

  if (!rows.length) notFound()
  const claim = rows[0]

  return (
    <>
      <header className="mb-5">
        <Link
          href="/claims"
          className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-nav transition hover:text-brand"
        >
          <ChevronLeft className="size-4" />
          Back to claims
        </Link>

        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-[20px] font-bold tracking-[-0.015em] sm:text-[22px]">
            {claim.claimant as string}
          </h1>
          <StatusChip status={claim.status as string} />
          <span className="text-[13px] tabular-nums text-nav">
            {claim.claim_ref as string} · {claim.insured as string} ·{' '}
            {claim.currency as string} {(claim.amount as number).toLocaleString()} · via{' '}
            {claim.channel as string}
          </span>
        </div>
      </header>

      {claim.document_id ? (
        <DocumentWorkspace
          documentId={claim.document_id as string}
          claimRef={claim.claim_ref as string}
        />
      ) : (
        <p className="rounded-2xl bg-white p-8 text-center text-[14px] text-muted">
          No documents attached to this claim.
        </p>
      )}
    </>
  )
}
