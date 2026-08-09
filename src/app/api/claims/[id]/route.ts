import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { requireCapability } from '@/lib/policy'
import { claimPatch } from '@/lib/contracts'
import { claimInScope } from '@/lib/claims-query'
import { sql } from '@/lib/db'
import { handleError } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession()
    requireCapability(session, 'claims.edit')

    const { id } = await params
    if (!(await claimInScope(session, id))) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    }

    const patch = claimPatch.parse(await req.json())

    const sets: string[] = []
    const values: unknown[] = []
    for (const [key, column] of [
      ['claimant', 'claimant'],
      ['status', 'status'],
      ['amount', 'amount'],
    ] as const) {
      const value = patch[key]
      if (value !== undefined) {
        values.push(value)
        sets.push(`${column} = $${values.length}`)
      }
    }

    if (!sets.length) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 422 })
    }

    values.push(id)
    await sql.query(
      `update claims set ${sets.join(', ')}, updated_at = now() where id = $${values.length}`,
      values,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession()
    // Only admin holds this. A Viewer forging the request lands here and stops.
    requireCapability(session, 'claims.delete')

    const { id } = await params
    if (!(await claimInScope(session, id))) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    }

    await sql.query('delete from claims where id = $1', [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
