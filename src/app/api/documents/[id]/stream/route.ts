import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { sql } from '@/lib/db'
import { statObject, readRange, parseRange } from '@/lib/storage'
import { handleError } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

/**
 * Range proxy.
 *
 * Streams the requested byte window straight through. It never reads the whole
 * object into memory, which is the property that lets the same handler serve a
 * 1.5 GB document as cheaply as a 5 MB one.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireSession()
    const { id } = await params

    const rows = (await sql.query(
      'select storage_key, filename from documents where id = $1',
      [id],
    )) as { storage_key: string; filename: string }[]

    if (!rows.length) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const key = rows[0].storage_key
    const info = await statObject(key)
    if (!info) {
      return NextResponse.json({ error: 'Object missing from storage' }, { status: 404 })
    }

    const common = {
      'Content-Type': 'application/pdf',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    }

    const range = parseRange(req.headers.get('range'), info.size)

    if (!range) {
      const body = await readRange(key, 0, info.size - 1)
      return new NextResponse(body, {
        status: 200,
        headers: { ...common, 'Content-Length': String(info.size) },
      })
    }

    const { start, end } = range
    const body = await readRange(key, start, end)
    return new NextResponse(body, {
      status: 206,
      headers: {
        ...common,
        'Content-Range': `bytes ${start}-${end}/${info.size}`,
        'Content-Length': String(end - start + 1),
      },
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function HEAD(req: NextRequest, ctx: Params) {
  const res = await GET(req, ctx)
  return new NextResponse(null, { status: res.status, headers: res.headers })
}
