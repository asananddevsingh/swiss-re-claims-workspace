import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { capabilitiesFor } from '@/lib/policy'
import { sql } from '@/lib/db'
import { statObject } from '@/lib/storage'
import { handleError } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

/**
 * The manifest is what the workspace opens on — a few kilobytes describing a
 * document that may be a gigabyte. It carries everything needed to lay out the
 * page rail and size the scrollbar correctly before any page has been fetched.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession()
    const { id } = await params

    const rows = (await sql.query(
      `select id, filename, byte_size, page_count, version, storage_key
       from documents where id = $1`,
      [id],
    )) as {
      id: string
      filename: string
      byte_size: string
      page_count: number
      version: number
      storage_key: string
    }[]

    if (!rows.length) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const doc = rows[0]
    const object = await statObject(doc.storage_key)

    // The catalogue records the production size; the demo fixture on disk is
    // smaller. Report both rather than pretend.
    const declaredSize = Number(doc.byte_size)
    const actualSize = object?.size ?? 0

    return NextResponse.json({
      id: doc.id,
      filename: doc.filename,
      version: doc.version,
      pageCount: doc.page_count,
      declaredSize,
      actualSize,
      available: Boolean(object),
      streamUrl: `/api/documents/${doc.id}/stream`,
      // A4 at 72dpi. A rasterisation service would return true per-page
      // dimensions here; fixed values are correct for this fixture.
      pageSize: { width: 595, height: 842 },
      capabilities: capabilitiesFor(session.role),
    })
  } catch (err) {
    return handleError(err)
  }
}
