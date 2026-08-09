import { sql } from './db'
import { rowScopeFor, type Session } from './policy'
import type { Claim, GridQuery } from './contracts'

/**
 * Builds the WHERE clause for a grid request.
 *
 * The row scope is appended here, from the session, and is never taken from the
 * request. A caller who tampers with the query string can narrow their result
 * set but cannot widen it past what their role allows.
 */
function buildWhere(session: Session, q: GridQuery) {
  const clauses: string[] = []
  const params: unknown[] = []

  const scope = rowScopeFor(session)
  if (scope.kind === 'team') {
    params.push(scope.teamId)
    clauses.push(`c.team_id = $${params.length}`)
  } else if (scope.kind === 'assigned') {
    params.push(scope.userId)
    clauses.push(`c.assignee_id = $${params.length}`)
  }

  if (q.status) {
    params.push(q.status)
    clauses.push(`c.status = $${params.length}`)
  }
  if (q.channel) {
    params.push(q.channel)
    clauses.push(`c.channel = $${params.length}`)
  }
  if (q.type) {
    params.push(q.type)
    clauses.push(`c.claim_type = $${params.length}`)
  }
  if (q.q) {
    params.push(`%${q.q.toLowerCase()}%`)
    const p = params.length
    clauses.push(
      `(lower(c.claimant) like $${p} or lower(c.claim_ref) like $${p} or lower(c.insured) like $${p} or lower(c.policy_no) like $${p})`,
    )
  }

  return {
    text: clauses.length ? `where ${clauses.join(' and ')}` : '',
    params,
  }
}

const SORT_COLUMN: Record<string, string> = {
  updated_at: 'c.updated_at',
  amount: 'c.amount',
  claimant: 'c.claimant',
  status: 'c.status',
}

/**
 * Above this, an exact COUNT(*) stops being cheap enough to run on every
 * keystroke and the planner estimate takes over. Chosen so the whole seeded
 * dataset is counted exactly — an estimate is only worth its imprecision once
 * the exact answer actually costs something.
 *
 * Two consequences of estimating that matter, and are why the bar is this high:
 * the number does not move when a row is deleted until the table is analysed,
 * and a total that disagrees with what the user just did reads as a bug.
 */
const EXACT_COUNT_LIMIT = 50_000

/**
 * Total row count.
 *
 * COUNT(*) across a genuinely large filtered set on every keystroke is the query
 * that takes a database down, so the planner's estimate is used beyond the limit
 * above. The response flags which one it was so the UI can present an estimate
 * honestly instead of passing it off as exact.
 */
async function countRows(where: { text: string; params: unknown[] }) {
  const plan = (await sql.query(
    `explain (format json) select 1 from claims c ${where.text}`,
    where.params,
  )) as { 'QUERY PLAN': unknown }[]

  const raw = plan[0]?.['QUERY PLAN'] as
    | { Plan: { 'Plan Rows': number } }[]
    | { Plan: { 'Plan Rows': number } }
  const node = Array.isArray(raw) ? raw[0] : raw
  const estimate = node?.Plan?.['Plan Rows'] ?? 0

  if (estimate < EXACT_COUNT_LIMIT) {
    const rows = (await sql.query(
      `select count(*)::int as n from claims c ${where.text}`,
      where.params,
    )) as { n: number }[]
    return { total: rows[0]?.n ?? 0, isEstimate: false }
  }

  return { total: estimate, isEstimate: true }
}

export async function fetchClaims(session: Session, q: GridQuery) {
  const where = buildWhere(session, q)
  const sortCol = SORT_COLUMN[q.sort] ?? 'c.updated_at'
  const dir = q.dir === 'asc' ? 'asc' : 'desc'

  const offset = (q.page - 1) * q.pageSize
  const params = [...where.params, q.pageSize, offset]

  const rows = (await sql.query(
    `select
       c.id, c.claim_ref, c.claimant, c.insured, c.policy_no, c.claim_type,
       c.channel, c.amount::float8 as amount, c.currency, c.status,
       c.assignee_id, u.name as assignee_name, c.document_id, c.updated_at
     from claims c
     left join users u on u.id = c.assignee_id
     ${where.text}
     order by ${sortCol} ${dir}, c.id ${dir}
     limit $${params.length - 1} offset $${params.length}`,
    params,
  )) as Record<string, unknown>[]

  const { total, isEstimate } = await countRows(where)

  const claims: Claim[] = rows.map((r) => ({
    id: r.id as string,
    claimRef: r.claim_ref as string,
    claimant: r.claimant as string,
    insured: r.insured as string,
    policyNo: r.policy_no as string,
    claimType: r.claim_type as string,
    channel: r.channel as string,
    amount: r.amount as number,
    currency: r.currency as string,
    status: r.status as Claim['status'],
    assigneeId: (r.assignee_id as string) ?? null,
    assigneeName: (r.assignee_name as string) ?? null,
    documentId: (r.document_id as string) ?? null,
    updatedAt: new Date(r.updated_at as string).toISOString(),
  }))

  return { claims, total, isEstimate }
}

/** Confirms a claim is inside the caller's row scope before any mutation. */
export async function claimInScope(session: Session, claimId: string) {
  const scope = rowScopeFor(session)
  const params: unknown[] = [claimId]
  let extra = ''

  if (scope.kind === 'team') {
    params.push(scope.teamId)
    extra = 'and team_id = $2'
  } else if (scope.kind === 'assigned') {
    params.push(scope.userId)
    extra = 'and assignee_id = $2'
  }

  const rows = (await sql.query(
    `select id from claims where id = $1 ${extra} limit 1`,
    params,
  )) as { id: string }[]

  return rows.length > 0
}
