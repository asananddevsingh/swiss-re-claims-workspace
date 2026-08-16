import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { DocumentWorkspace } from '@/components/workspace/document-workspace'
import { getSession } from '@/lib/session'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Opens a document directly, rather than through the claim that owns it.
 *
 * This is how the output of a split becomes reachable — without it, a completed
 * operation produced a catalogue row nobody could see.
 */
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { id } = await params

  const rows = (await sql.query(
    'select id, filename, page_count, version from documents where id = $1',
    [id],
  )) as { id: string; filename: string; page_count: number; version: number }[]

  if (!rows.length) notFound()
  const doc = rows[0]

  // Derived documents carry their source in the id, so the trail back is direct.
  const sourceId = doc.id.replace(/-v\d+-[a-z0-9]+$/, '')
  const isDerived = sourceId !== doc.id

  return (
    <>
      <header className="mb-5">
        <Link
          href={isDerived ? `/documents/${sourceId}` : '/claims'}
          className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-nav transition hover:text-brand"
        >
          <ChevronLeft className="size-4" />
          {isDerived ? 'Back to source document' : 'Back to claims'}
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] font-bold tracking-[-0.015em] sm:text-[22px]">
            {doc.filename}
          </h1>
          {isDerived && (
            <span className="rounded-chip border border-[#8f77f0] bg-brand-soft px-3 py-[3px] text-[12px] font-semibold text-brand">
              Operation output · v{doc.version}
            </span>
          )}
          <span className="text-[13px] tabular-nums text-nav">
            {doc.page_count.toLocaleString()} pages
          </span>
        </div>
      </header>

      <DocumentWorkspace documentId={doc.id} claimRef={doc.filename} />
    </>
  )
}
