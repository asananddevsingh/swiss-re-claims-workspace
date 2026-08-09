import { NextResponse, type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { capabilitiesFor, rowScopeFor } from '@/lib/policy'
import { gridQuery, type GridResponse } from '@/lib/contracts'
import { fetchClaims } from '@/lib/claims-query'
import { handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

const SCOPE_LABEL = {
  all: 'All claims',
  team: 'Team claims',
  assigned: 'Assigned to you',
} as const

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const q = gridQuery.parse(Object.fromEntries(req.nextUrl.searchParams))

    const { claims, total, isEstimate } = await fetchClaims(session, q)

    const body: GridResponse = {
      rows: claims,
      total,
      totalIsEstimate: isEstimate,
      page: q.page,
      pageSize: q.pageSize,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
      capabilities: capabilitiesFor(session.role),
      scope: SCOPE_LABEL[rowScopeFor(session).kind],
    }

    return NextResponse.json(body)
  } catch (err) {
    return handleError(err)
  }
}
