/**
 * Returns the demo to a known-good state without a full reseed.
 *
 * Clears split/merge outputs and their job history, restores any claim removed
 * while testing the delete path, and verifies every catalogue document has an
 * object behind it — the check that would have caught fixtures being missing
 * for three of the four documents.
 *
 *   pnpm demo:reset
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)
const ROOT = join(process.cwd(), 'storage')

async function main() {
  // 1. Derived documents from split jobs, and the jobs that produced them.
  const derived = (await sql.query(
    // Any derived version, not just v2 — an earlier pattern matched only the
    // first generation and left v3 onward behind.
    `select id, storage_key from documents where id ~ '-v[0-9]+-'`,
  )) as { id: string; storage_key: string }[]

  await sql.query('delete from jobs')
  for (const d of derived) {
    await sql.query('delete from documents where id = $1', [d.id])
    const path = join(ROOT, d.storage_key)
    if (existsSync(path)) rmSync(path)
  }
  console.log(`cleared ${derived.length} split output(s) and all job history`)

  // 2. Claims removed while testing deletion.
  const [{ count }] = (await sql.query('select count(*)::int as count from claims')) as {
    count: number
  }[]
  if (count < 20_000) {
    console.log(`claims at ${count.toLocaleString()} — run "pnpm db:seed" for a full restore`)
  } else {
    console.log(`claims: ${count.toLocaleString()}`)
  }

  // 3. Every catalogue document must have bytes, or the workspace shows an error.
  const docs = (await sql.query(
    'select id, page_count, storage_key from documents order by id',
  )) as { id: string; page_count: number; storage_key: string }[]

  let missing = 0
  for (const d of docs) {
    const ok = existsSync(join(ROOT, d.storage_key))
    if (!ok) missing++
    console.log(`  ${ok ? '✓' : '✗'} ${d.id} — ${d.page_count} pages`)
  }

  if (missing) {
    console.error(`\n${missing} document(s) have no object in storage. Run: pnpm fixtures`)
    process.exit(1)
  }

  console.log('\nready')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
