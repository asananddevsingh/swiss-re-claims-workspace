/**
 * Builds the claim bundle fixture the workspace streams.
 *
 * Page count is the number that matters for the demo — it is what makes the
 * difference between "download the file" and "fetch the byte range for page
 * 2,400" visible. Run with: npx tsx scripts/make-bundle.ts [pages]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGES = Number(process.argv[2] ?? 2400)
const OUT = join(process.cwd(), 'storage', 'documents')

const SECTIONS = [
  'First Notice of Loss',
  'Policy Schedule',
  'Adjuster Field Report',
  'Repair Estimates',
  'Third-Party Correspondence',
  'Medical Summary',
  'Photographic Evidence Log',
  'Settlement Calculation',
]

const CLAIMANTS = [
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

async function main() {
  console.log(`building ${PAGES}-page bundle…`)
  const doc = await PDFDocument.create()
  const body = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const rand = mulberry32(4180)

  doc.setTitle('Claim Bundle 2026 — Consolidated File')
  doc.setAuthor('Claims Intake')
  doc.setSubject('Adjudication working copy')

  for (let i = 0; i < PAGES; i++) {
    const page = doc.addPage([595, 842]) // A4
    const section = SECTIONS[Math.floor(i / Math.ceil(PAGES / SECTIONS.length))] ?? SECTIONS[0]
    const claimant = CLAIMANTS[i % CLAIMANTS.length]

    // Header band
    page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: rgb(0.349, 0.196, 0.918) })
    page.drawText('CLAIM BUNDLE 2026', {
      x: 40, y: 812, size: 13, font: bold, color: rgb(1, 1, 1),
    })
    page.drawText(section, {
      x: 40, y: 794, size: 9, font: body, color: rgb(0.85, 0.83, 0.98),
    })
    page.drawText(`Page ${i + 1} of ${PAGES}`, {
      x: 448, y: 806, size: 10, font: bold, color: rgb(1, 1, 1),
    })

    // Big page number so scrolling is legible at thumbnail size
    page.drawText(String(i + 1), {
      x: 40, y: 600, size: 96, font: bold, color: rgb(0.93, 0.93, 0.96),
    })

    page.drawText(claimant, { x: 40, y: 720, size: 16, font: bold, color: rgb(0.16, 0.18, 0.2) })
    page.drawText(`Reference CLM-2026-${String(100000 + (i * 7) % 20000).slice(-6)}`, {
      x: 40, y: 700, size: 10, font: body, color: rgb(0.44, 0.47, 0.55),
    })

    // Body lines — varied so pages are not byte-identical
    let y = 560
    const lines = 14 + Math.floor(rand() * 8)
    for (let l = 0; l < lines; l++) {
      const width = 300 + rand() * 215
      page.drawRectangle({
        x: 40, y, width, height: 6,
        color: rgb(0.88 + rand() * 0.06, 0.89, 0.93),
      })
      y -= 16
    }

    // A table block on every fourth page
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

    page.drawText(`Adjudication working copy — not for distribution`, {
      x: 40, y: 30, size: 8, font: body, color: rgb(0.71, 0.72, 0.75),
    })

    if ((i + 1) % 400 === 0) console.log(`  ${i + 1} pages`)
  }

  const bytes = await doc.save({ useObjectStreams: false })
  mkdirSync(OUT, { recursive: true })
  const path = join(OUT, 'doc-claims-bundle.pdf')
  writeFileSync(path, bytes)

  console.log(`wrote ${path}`)
  console.log(`  ${PAGES} pages · ${(bytes.length / 1_048_576).toFixed(1)} MB`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
