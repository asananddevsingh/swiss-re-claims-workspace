import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { sql } from '@/lib/db'
import { handleError } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

/**
 * Cooperative cancel. Flips the row; the worker checks between page batches and
 * stops before it writes anything, so there is no partial output to clean up.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireSession()
    const { id } = await params

    await sql.query(
      `update jobs set status = 'cancelled', message = 'Cancelled by user', updated_at = now()
       where id = $1 and status in ('queued','running')`,
      [id],
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
