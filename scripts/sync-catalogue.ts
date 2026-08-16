/**
 * Aligns the catalogue with the fixtures actually on disk, so a manifest never
 * advertises pages the viewer cannot reach.
 *
 * Updates by storage key rather than by document id: many claim documents share
 * one object, and all of them must report the same page count.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { PDFDocument } from 'pdf-lib'
import { config } from 'dotenv'
import { FIXTURES } from './fixtures'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)
const ROOT = join(process.cwd(), 'storage')

async function main() {
  for (const fixture of FIXTURES) {
    const path = join(ROOT, fixture.key)

    if (!existsSync(path)) {
      console.log(`  ✗ ${basename(fixture.key)} — missing, run: pnpm fixtures`)
      continue
    }

    const doc = await PDFDocument.load(readFileSync(path), { updateMetadata: false })
    const pages = doc.getPageCount()
    const size = statSync(path).size

    const rows = (await sql.query(
      'update documents set page_count = $1 where storage_key = $2 returning id',
      [pages, fixture.key],
    )) as { id: string }[]

    console.log(
      `  ✓ ${basename(fixture.key)} — ${pages} pages, ${(size / 1_048_576).toFixed(1)} MB` +
        ` → ${rows.length.toLocaleString()} document rows`,
    )
  }

  const [{ docs }] = (await sql.query('select count(*)::int as docs from documents')) as {
    docs: number
  }[]
  console.log(`\n${docs.toLocaleString()} documents across ${FIXTURES.length} objects`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
