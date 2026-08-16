/**
 * Returns the demo to a known-good state without a full reseed.
 *
 * Clears split/merge outputs and their job history, and verifies every fixture
 * the catalogue points at is actually present — the check that would have
 * caught three of four documents having no bytes behind them.
 *
 *   pnpm demo:reset
 */
import { existsSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { FIXTURES } from './fixtures'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)
const ROOT = join(process.cwd(), 'storage')

async function main() {
  // 1. Outputs produced by page operations, and the jobs that made them.
  //    Matches any derived generation — an earlier pattern caught only v2.
  const derived = (await sql.query(
    `select id, storage_key from documents where id ~ '-v[0-9]+-'`,
  )) as { id: string; storage_key: string }[]

  await sql.query('delete from jobs')
  for (const d of derived) {
    await sql.query('delete from documents where id = $1', [d.id])
    const path = join(ROOT, d.storage_key)
    if (existsSync(path)) rmSync(path)
  }
  console.log(`cleared ${derived.length} operation output(s) and all job history`)

  // 2. Dataset size.
  const [{ claims, docs }] = (await sql.query(
    'select (select count(*) from claims)::int as claims, (select count(*) from documents)::int as docs',
  )) as { claims: number; docs: number }[]

  console.log(`claims: ${claims.toLocaleString()} · documents: ${docs.toLocaleString()}`)
  if (claims < 20_000) {
    console.log('  below the seeded size — run "pnpm db:seed" for a full restore')
  }

  // 3. Every object the catalogue points at must exist, or the workspace shows
  //    an error where a document should be.
  const referenced = (await sql.query(
    `select storage_key, count(*)::int as n, min(page_count)::int as pages
     from documents where bytes is null group by storage_key order by storage_key`,
  )) as { storage_key: string; n: number; pages: number }[]

  let missing = 0
  for (const r of referenced) {
    const ok = existsSync(join(ROOT, r.storage_key))
    if (!ok) missing++
    console.log(
      `  ${ok ? '✓' : '✗'} ${basename(r.storage_key)} — ${r.pages} pages,` +
        ` referenced by ${r.n.toLocaleString()} document(s)`,
    )
  }

  const unknown = referenced.filter((r) => !FIXTURES.some((f) => f.key === r.storage_key))
  if (unknown.length) {
    console.log(`  note: ${unknown.length} object(s) not in the fixture list`)
  }

  if (missing) {
    console.error(`\n${missing} object(s) missing from storage. Run: pnpm fixtures`)
    process.exit(1)
  }

  console.log('\nready')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
