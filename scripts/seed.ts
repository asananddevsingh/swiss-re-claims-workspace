import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)

const ROW_COUNT = 20_000

const FIRST = [
  'Jane', 'Floyd', 'Ronald', 'Marvin', 'Jerome', 'Kathryn', 'Jacob', 'Kristin',
  'Anna', 'Marco', 'Priya', 'Dana', 'Lukas', 'Sofia', 'Elena', 'Tomas',
  'Aisha', 'Rahul', 'Nina', 'Oscar', 'Mei', 'Karim', 'Lena', 'Diego',
  'Hannah', 'Yusuf', 'Clara', 'Viktor', 'Amara', 'Felix',
]

const LAST = [
  'Cooper', 'Miles', 'Richards', 'McKinney', 'Bell', 'Murphy', 'Jones', 'Watson',
  'Weber', 'Rossi', 'Nair', 'Fischer', 'Novak', 'Silva', 'Keller', 'Dubois',
  'Haddad', 'Sharma', 'Berg', 'Moreau', 'Chen', 'Osei', 'Lindqvist', 'Ferrari',
]

const INSURED = [
  'Helvetia Logistics AG', 'Nordwind Shipping', 'Alpine Freight GmbH',
  'Meridian Health Group', 'Baltic Marine Ltd', 'Castellan Property Trust',
  'Rhine Valley Motors', 'Continental Agri Co', 'Solaris Energy SE',
  'Fairhaven Hospitality', 'Kestrel Aviation', 'Halden Manufacturing',
  'Tramontane Retail', 'Orion Data Centres', 'Weisshorn Ski Resorts',
]

const TYPES = ['Property', 'Motor', 'Liability', 'Health', 'Marine']
const CHANNELS = ['Email', 'SFTP', 'Portal', 'API']
const STATUSES = ['New', 'In Review', 'Awaiting Docs', 'Approved', 'Rejected', 'Settled']

// Weighted so the grid looks like a real queue rather than an even split.
const STATUS_WEIGHTS = [0.18, 0.26, 0.14, 0.19, 0.08, 0.15]

const USERS = [
  { id: 'u-anna', name: 'Anna Weber', role: 'adjudicator', team: 'team-zrh', hue: 258 },
  { id: 'u-marco', name: 'Marco Rossi', role: 'supervisor', team: 'team-zrh', hue: 160 },
  { id: 'u-priya', name: 'Priya Nair', role: 'auditor', team: 'team-blr', hue: 28 },
  { id: 'u-dana', name: 'Dana Fischer', role: 'admin', team: 'team-zrh', hue: 340 },
  { id: 'u-lukas', name: 'Lukas Keller', role: 'adjudicator', team: 'team-zrh', hue: 200 },
  { id: 'u-sofia', name: 'Sofia Silva', role: 'adjudicator', team: 'team-blr', hue: 12 },
  { id: 'u-tomas', name: 'Tomas Novak', role: 'adjudicator', team: 'team-blr', hue: 96 },
]

const TEAMS = ['team-zrh', 'team-blr']

// Deterministic PRNG so reseeding produces an identical dataset.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260809)

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

function weightedStatus(): string {
  const r = rand()
  let acc = 0
  for (let i = 0; i < STATUSES.length; i++) {
    acc += STATUS_WEIGHTS[i]
    if (r <= acc) return STATUSES[i]
  }
  return STATUSES[STATUSES.length - 1]
}

async function main() {
  console.log('applying schema…')
  const ddl = readFileSync(join(process.cwd(), 'src/lib/schema.sql'), 'utf8')
  for (const stmt of ddl.split(';').map((s) => s.trim()).filter(Boolean)) {
    await sql.query(stmt)
  }

  console.log('seeding users…')
  for (const u of USERS) {
    await sql.query(
      'insert into users (id, name, role, team_id, avatar_hue) values ($1,$2,$3,$4,$5)',
      [u.id, u.name, u.role, u.team, u.hue],
    )
  }

  console.log('seeding documents…')
  const docs = [
    { id: 'doc-claims-bundle', file: 'claim-bundle-2026.pdf', size: 1_476_395_008, pages: 4180 },
    { id: 'doc-survey-report', file: 'survey-report.pdf', size: 214_958_080, pages: 612 },
    { id: 'doc-medical-file', file: 'medical-records.pdf', size: 689_147_904, pages: 1944 },
    { id: 'doc-policy-pack', file: 'policy-wording.pdf', size: 104_857_600, pages: 288 },
  ]
  for (const d of docs) {
    await sql.query(
      'insert into documents (id, filename, byte_size, page_count, storage_key) values ($1,$2,$3,$4,$5)',
      [d.id, d.file, d.size, d.pages, `documents/${d.id}.pdf`],
    )
  }

  console.log(`seeding ${ROW_COUNT.toLocaleString()} claims…`)
  const now = Date.now()
  const adjudicators = USERS.filter((u) => u.role === 'adjudicator')

  const BATCH = 500
  let inserted = 0

  for (let start = 0; start < ROW_COUNT; start += BATCH) {
    const values: unknown[] = []
    const tuples: string[] = []

    for (let i = start; i < Math.min(start + BATCH, ROW_COUNT); i++) {
      const assignee = rand() < 0.88 ? pick(adjudicators) : null
      const team = assignee ? assignee.team : pick(TEAMS)
      const created = now - Math.floor(rand() * 420) * 86_400_000
      const updated = created + Math.floor(rand() * 30) * 86_400_000

      const row = [
        `clm-${String(i + 1).padStart(6, '0')}`,
        `CLM-2026-${String(100000 + i).slice(-6)}`,
        `${pick(FIRST)} ${pick(LAST)}`,
        pick(INSURED),
        `POL-${String(Math.floor(rand() * 900000) + 100000)}`,
        pick(TYPES),
        pick(CHANNELS),
        (rand() * 480_000 + 1_200).toFixed(2),
        'CHF',
        weightedStatus(),
        assignee?.id ?? null,
        team,
        pick(docs).id,
        new Date(created).toISOString(),
        new Date(Math.min(updated, now)).toISOString(),
      ]

      const base = values.length
      tuples.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`,
      )
      values.push(...row)
    }

    await sql.query(
      `insert into claims (id, claim_ref, claimant, insured, policy_no, claim_type, channel,
        amount, currency, status, assignee_id, team_id, document_id, created_at, updated_at)
       values ${tuples.join(',')}`,
      values,
    )

    inserted += tuples.length
    if (inserted % 5000 === 0) console.log(`  ${inserted.toLocaleString()} rows`)
  }

  console.log('seeding sample annotations…')
  const notes = [
    [0, 'Policy excess confirmed against schedule on page 12.'],
    [11, 'Third-party estimate differs from adjuster figure — flagged.'],
    [47, 'Signature page. Verified against KYC record.'],
  ] as const
  for (const [page, body] of notes) {
    await sql.query(
      `insert into annotations (id, document_id, page_index, kind, x, y, w, h, body, author_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        `ann-${page}`, 'doc-claims-bundle', page, 'note',
        0.12, 0.18 + (page % 3) * 0.2, 0.34, 0.06, body, 'u-marco',
      ],
    )
  }

  await sql.query('analyze claims')

  const [{ count }] = (await sql.query('select count(*)::int as count from claims')) as {
    count: number
  }[]
  console.log(`done — ${count.toLocaleString()} claims`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
