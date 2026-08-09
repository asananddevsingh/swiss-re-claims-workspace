import { NextResponse, after, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { requireCapability } from '@/lib/policy'
import { operationBody } from '@/lib/contracts'
import { runPageOperation } from '@/lib/jobs'
import { sql } from '@/lib/db'
import { handleError } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export const maxDuration = 60

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession()
    const { id } = await params
    const input = operationBody.parse(await req.json())

    requireCapability(session, input.kind === 'merge' ? 'documents.merge' : 'documents.split')

    // Replaying a submission returns the original job rather than doing the
    // work twice. This is what makes the retry button safe on an operation
    // that is expensive and not idempotent by nature.
    const existing = (await sql.query(
      'select id, status from jobs where idempotency_key = $1',
      [input.idempotencyKey],
    )) as { id: string; status: string }[]

    if (existing.length) {
      return NextResponse.json({ jobId: existing[0].id, replayed: true })
    }

    const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

    await sql.query(
      `insert into jobs (id, document_id, kind, status, total_pages, idempotency_key, requested_by)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [jobId, id, input.kind, 'queued', input.pages.length, input.idempotencyKey, session.userId],
    )

    // Runs after the response is flushed, so the client gets its job id
    // immediately instead of holding a connection open for the whole operation.
    after(() => runPageOperation(jobId, id, input.kind, input.pages))

    return NextResponse.json({ jobId, replayed: false }, { status: 202 })
  } catch (err) {
    return handleError(err)
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireSession()
    const { id } = await params

    const rows = (await sql.query(
      `select id, kind, status, progress, total_pages, message, created_at
       from jobs where document_id = $1 order by created_at desc limit 20`,
      [id],
    )) as Record<string, unknown>[]

    return NextResponse.json({
      jobs: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        progress: r.progress,
        totalPages: r.total_pages,
        message: r.message ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}
