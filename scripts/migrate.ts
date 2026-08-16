/**
 * Idempotent schema migrations for an already-seeded database.
 *
 * `db:seed` drops and recreates everything, which is fine locally and wrong
 * against a running deployment. These statements bring an existing database
 * up to date without touching its data.
 *
 *   pnpm db:migrate
 */
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

const MIGRATIONS: { name: string; statement: string }[] = [
  {
    name: 'documents.bytes — durable store for job output',
    statement: 'alter table documents add column if not exists bytes bytea',
  },
  {
    name: 'documents.storage_key index — storage lookups go through this',
    statement: 'create index if not exists documents_storage_key on documents (storage_key)',
  },
]

async function main() {
  for (const m of MIGRATIONS) {
    await sql.query(m.statement)
    console.log(`  ✓ ${m.name}`)
  }

  const cols = (await sql.query(
    `select column_name from information_schema.columns
     where table_name = 'documents' order by ordinal_position`,
  )) as { column_name: string }[]

  console.log(`\ndocuments columns: ${cols.map((c) => c.column_name).join(', ')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
