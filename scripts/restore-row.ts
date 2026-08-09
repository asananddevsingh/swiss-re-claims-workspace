/**
 * Puts back a claim removed while testing the delete path, so the seeded
 * dataset stays at its documented size without a full reseed (which would
 * discard annotations and job history).
 */
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

async function main() {
  const id = process.argv[2] ?? 'clm-000100'

  const existing = (await sql.query('select id from claims where id = $1', [id])) as {
    id: string
  }[]
  if (existing.length) {
    console.log(`${id} already present`)
    return
  }

  await sql.query(
    `insert into claims (id, claim_ref, claimant, insured, policy_no, claim_type, channel,
       amount, currency, status, assignee_id, team_id, document_id, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now() - interval '90 days', now() - interval '6 days')`,
    [
      id, 'CLM-2026-100099', 'Kathryn Murphy', 'Alpine Freight GmbH', 'POL-418277',
      'Motor', 'Portal', 24880.0, 'CHF', 'In Review', 'u-anna', 'team-zrh', 'doc-claims-bundle',
    ],
  )

  const [{ count }] = (await sql.query('select count(*)::int as count from claims')) as {
    count: number
  }[]
  console.log(`restored ${id} — ${count.toLocaleString()} claims`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
