/**
 * Aligns the document catalogue with whatever fixtures are actually on disk,
 * so the manifest never advertises pages the viewer cannot reach.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { PDFDocument } from 'pdf-lib'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL!)

async function main() {
  const dir = join(process.cwd(), 'storage', 'documents')
  const files = readdirSync(dir).filter((f) => f.endsWith('.pdf'))

  for (const file of files) {
    const id = file.replace(/\.pdf$/, '')
    const path = join(dir, file)
    const bytes = readFileSync(path)
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    const pages = doc.getPageCount()
    const size = statSync(path).size

    await sql.query('update documents set page_count = $1 where id = $2', [pages, id])
    console.log(`${id}: ${pages} pages, ${(size / 1_048_576).toFixed(1)} MB on disk`)
  }

  const rows = (await sql.query(
    'select id, page_count, byte_size from documents order by id',
  )) as { id: string; page_count: number; byte_size: string }[]

  console.table(
    rows.map((r) => ({
      id: r.id,
      pages: r.page_count,
      declared: `${(Number(r.byte_size) / 1_048_576).toFixed(0)} MB`,
    })),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
