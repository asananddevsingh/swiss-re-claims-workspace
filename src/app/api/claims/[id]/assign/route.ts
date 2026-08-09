import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { requireCapability } from '@/lib/policy'
import { assignBody } from '@/lib/contracts'
import { claimInScope } from '@/lib/claims-query'
import { sql } from '@/lib/db'
import { handleError } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession()
    requireCapability(session, 'claims.assign')

    const { id } = await params
    if (!(await claimInScope(session, id))) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    }

    const { assigneeId } = assignBody.parse(await req.json())

    if (assigneeId) {
      const rows = (await sql.query('select team_id from users where id = $1', [
        assigneeId,
      ])) as { team_id: string }[]
      if (!rows.length) {
        return NextResponse.json({ error: 'Unknown assignee' }, { status: 422 })
      }
      // A supervisor may only hand work to their own team.
      if (session.role === 'supervisor' && rows[0].team_id !== session.teamId) {
        return NextResponse.json(
          { error: 'Cannot assign outside your team' },
          { status: 403 },
        )
      }
    }

    await sql.query(
      'update claims set assignee_id = $1, updated_at = now() where id = $2',
      [assigneeId, id],
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}

export async function GET() {
  try {
    await requireSession()
    const rows = (await sql.query(
      `select id, name, team_id from users where role = 'adjudicator' order by name`,
    )) as { id: string; name: string; team_id: string }[]
    return NextResponse.json({ assignees: rows })
  } catch (err) {
    return handleError(err)
  }
}
