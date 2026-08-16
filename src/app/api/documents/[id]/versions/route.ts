import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { sql } from '@/lib/db'
import { statObject } from '@/lib/storage'
import { handleError } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

/**
 * Documents produced by page operations on this one.
 *
 * Without this the workspace gave no evidence a split had happened: the job
 * reported success and nothing in the interface changed. The output is a real
 * catalogue row, so listing it is what makes the operation demonstrable.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireSession()
    const { id } = await params

    const rows = (await sql.query(
      `select id, filename, page_count, byte_size, version, storage_key, created_at
       from documents
       where id like $1
       order by created_at desc
       limit 20`,
      [`${id}-v%`],
    )) as {
      id: string
      filename: string
      page_count: number
      byte_size: string
      version: number
      storage_key: string
      created_at: string
    }[]

    const versions = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        filename: r.filename,
        pageCount: r.page_count,
        byteSize: Number(r.byte_size),
        version: r.version,
        createdAt: new Date(r.created_at).toISOString(),
        // Outputs are written to the only writable path a serverless host has,
        // which is per-instance. The row is durable; the bytes may not be.
        available: Boolean(await statObject(r.storage_key)),
      })),
    )

    return NextResponse.json({ versions })
  } catch (err) {
    return handleError(err)
  }
}
