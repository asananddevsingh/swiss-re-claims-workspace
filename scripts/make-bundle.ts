/**
 * Builds the PDF fixtures the workspace streams.
 *
 * Driven by the document catalogue rather than a hardcoded list: every row in
 * `documents` that has no object on disk gets one built at its recorded page
 * count. That is deliberate — an earlier version built a single fixture while
 * the seed created four rows, so three quarters of claims opened onto a
 * "bytes unavailable" state.
 *
 *   pnpm fixtures            build whatever is missing
 *   pnpm fixtures --force    rebuild everything
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const OUT = join(process.cwd(), 'storage', 'documents')
const FORCE = process.argv.includes('--force')

type Profile = { title: string; sections: string[] }

const PROFILES: Record<string, Profile> = {
  'doc-claims-bundle': {
    title: 'CLAIM BUNDLE 2026',
    sections: [
      'First Notice of Loss', 'Policy Schedule', 'Adjuster Field Report',
      'Repair Estimates', 'Third-Party Correspondence', 'Medical Summary',
      'Photographic Evidence Log', 'Settlement Calculation',
    ],
  },
  'doc-survey-report': {
    title: 'SURVEY REPORT',
    sections: [
      'Site Attendance', 'Damage Assessment', 'Cause and Origin',
      'Salvage Valuation', 'Recommendations',
    ],
  },
  'doc-medical-file': {
    title: 'MEDICAL RECORDS',
    sections: [
      'Admission Notes', 'Diagnostic Imaging', 'Consultant Correspondence',
      'Treatment Plan', 'Discharge Summary', 'Rehabilitation Schedule',
    ],
  },
  'doc-policy-pack': {
    title: 'POLICY WORDING',
    sections: [
      'Insuring Clause', 'Definitions', 'General Exclusions',
      'Conditions Precedent', 'Endorsements',
    ],
  },
}

const FALLBACK: Profile = {
  title: 'CLAIM DOCUMENT',
  sections: ['Correspondence', 'Attachments', 'Summary'],
}

const PARTIES = [
  'Helvetia Logistics AG', 'Nordwind Shipping', 'Alpine Freight GmbH',
  'Baltic Marine Ltd', 'Castellan Property Trust', 'Kestrel Aviation',
]

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function build(id: string, pages: number, profile: Profile) {
  const doc = await PDFDocument.create()
  const body = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const rand = mulberry32(pages * 7919)

  doc.setTitle(profile.title)
  doc.setSubject('Adjudication working copy')

  const perSection = Math.ceil(pages / profile.sections.length)

  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842])
    const section = profile.sections[Math.min(Math.floor(i / perSection), profile.sections.length - 1)]
    const party = PARTIES[i % PARTIES.length]

    page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: rgb(0.349, 0.196, 0.918) })
    page.drawText(profile.title, { x: 40, y: 812, size: 13, font: bold, color: rgb(1, 1, 1) })
    page.drawText(section, { x: 40, y: 794, size: 9, font: body, color: rgb(0.85, 0.83, 0.98) })
    page.drawText(`Page ${i + 1} of ${pages}`, {
      x: 448, y: 806, size: 10, font: bold, color: rgb(1, 1, 1),
    })

    // Large page number so position is legible even at thumbnail scale.
    page.drawText(String(i + 1), {
      x: 40, y: 600, size: 96, font: bold, color: rgb(0.93, 0.93, 0.96),
    })

    page.drawText(party, { x: 40, y: 720, size: 16, font: bold, color: rgb(0.16, 0.18, 0.2) })
    page.drawText(`Reference CLM-2026-${String(100000 + (i * 7) % 20000).slice(-6)}`, {
      x: 40, y: 700, size: 10, font: body, color: rgb(0.44, 0.47, 0.55),
    })

    let y = 560
    const lines = 14 + Math.floor(rand() * 8)
    for (let l = 0; l < lines; l++) {
      page.drawRectangle({
        x: 40, y, width: 300 + rand() * 215, height: 6,
        color: rgb(0.88 + rand() * 0.06, 0.89, 0.93),
      })
      y -= 16
    }

    if (i % 4 === 0) {
      page.drawText('Itemised assessment', {
        x: 40, y: y - 12, size: 11, font: bold, color: rgb(0.16, 0.18, 0.2),
      })
      let ty = y - 34
      for (let r = 0; r < 6; r++) {
        page.drawLine({
          start: { x: 40, y: ty }, end: { x: 555, y: ty },
          thickness: 0.5, color: rgb(0.93, 0.93, 0.95),
        })
        page.drawText(`Item ${r + 1}`, { x: 44, y: ty + 6, size: 9, font: body, color: rgb(0.3, 0.32, 0.36) })
        page.drawText(`CHF ${(rand() * 48000 + 400).toFixed(2)}`, {
          x: 460, y: ty + 6, size: 9, font: body, color: rgb(0.3, 0.32, 0.36),
        })
        ty -= 22
      }
    }

    page.drawText('Adjudication working copy — not for distribution', {
      x: 40, y: 30, size: 8, font: body, color: rgb(0.71, 0.72, 0.75),
    })
  }

  const bytes = await doc.save({ useObjectStreams: false })
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `${id}.pdf`), bytes)
  return bytes.length
}

async function main() {
  // Derived versions produced by split jobs are not rebuilt — they are outputs,
  // not fixtures, and no claim points at them.
  const rows = (await sql.query(
    `select id, page_count, storage_key from documents
     where id not like '%-v2-%' order by id`,
  )) as { id: string; page_count: number; storage_key: string }[]

  console.log(`${rows.length} catalogue documents`)

  for (const row of rows) {
    const path = join(process.cwd(), 'storage', row.storage_key)

    if (existsSync(path) && !FORCE) {
      console.log(`  ${row.id} — present, skipping`)
      continue
    }

    const profile = PROFILES[row.id] ?? FALLBACK
    process.stdout.write(`  ${row.id} — building ${row.page_count} pages… `)
    const size = await build(row.id, row.page_count, profile)
    console.log(`${(size / 1_048_576).toFixed(1)} MB`)
  }

  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
