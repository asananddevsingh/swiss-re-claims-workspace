import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { requireCapability } from '@/lib/policy'
import { annotationCreate } from '@/lib/contracts'
import { sql } from '@/lib/db'
import { handleError } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireSession()
    const { id } = await params

    const rows = (await sql.query(
      `select a.id, a.page_index, a.kind, a.x, a.y, a.w, a.h, a.body,
              a.author_id, u.name as author_name, a.created_at
       from annotations a
       left join users u on u.id = a.author_id
       where a.document_id = $1
       order by a.page_index, a.created_at`,
      [id],
    )) as Record<string, unknown>[]

    return NextResponse.json({
      annotations: rows.map((r) => ({
        id: r.id,
        pageIndex: r.page_index,
        kind: r.kind,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        body: r.body ?? null,
        authorId: r.author_id,
        authorName: r.author_name ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession()
    requireCapability(session, 'documents.annotate')

    const { id } = await params
    const input = annotationCreate.parse(await req.json())

    const annotationId = `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

    await sql.query(
      `insert into annotations (id, document_id, page_index, kind, x, y, w, h, body, author_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        annotationId, id, input.pageIndex, input.kind,
        input.x, input.y, input.w, input.h, input.body ?? null, session.userId,
      ],
    )

    return NextResponse.json({
      annotation: {
        id: annotationId,
        pageIndex: input.pageIndex,
        kind: input.kind,
        x: input.x,
        y: input.y,
        w: input.w,
        h: input.h,
        body: input.body ?? null,
        authorId: session.userId,
        authorName: session.name,
        createdAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession()
    requireCapability(session, 'documents.annotate')
    await params

    const annotationId = req.nextUrl.searchParams.get('annotationId')
    if (!annotationId) {
      return NextResponse.json({ error: 'annotationId required' }, { status: 422 })
    }

    // Authors delete their own marks; supervisors and admins clear any.
    const scoped = session.role === 'adjudicator'
    await sql.query(
      `delete from annotations where id = $1 ${scoped ? 'and author_id = $2' : ''}`,
      scoped ? [annotationId, session.userId] : [annotationId],
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
