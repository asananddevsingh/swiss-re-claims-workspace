/**
 * The physical PDF fixtures, shared by the seed and the generator.
 *
 * Every claim gets its own `documents` row, but rows point at one of these four
 * objects. That keeps comments and operation history scoped to a single claim —
 * they are keyed to a document, and a document now belongs to one claim — while
 * the bytes on disk stay at four files rather than twenty thousand.
 *
 * A real system would also model genuinely shared documents: policy wording
 * covers many claims, and a note on an exclusion clause should be visible to
 * everyone reading it. That distinction is deliberate there and absent here.
 */
export type Fixture = {
  key: string
  filename: string
  pages: number
  /** Size the catalogue advertises — the production figure, not the fixture's. */
  declaredSize: number
  title: string
  sections: string[]
}

export const FIXTURES: Fixture[] = [
  {
    key: 'documents/doc-claims-bundle.pdf',
    filename: 'claim-bundle-2026.pdf',
    pages: 2400,
    declaredSize: 1_476_395_008,
    title: 'CLAIM BUNDLE 2026',
    sections: [
      'First Notice of Loss', 'Policy Schedule', 'Adjuster Field Report',
      'Repair Estimates', 'Third-Party Correspondence', 'Medical Summary',
      'Photographic Evidence Log', 'Settlement Calculation',
    ],
  },
  {
    key: 'documents/doc-medical-file.pdf',
    filename: 'medical-records.pdf',
    pages: 1944,
    declaredSize: 689_147_904,
    title: 'MEDICAL RECORDS',
    sections: [
      'Admission Notes', 'Diagnostic Imaging', 'Consultant Correspondence',
      'Treatment Plan', 'Discharge Summary', 'Rehabilitation Schedule',
    ],
  },
  {
    key: 'documents/doc-survey-report.pdf',
    filename: 'survey-report.pdf',
    pages: 612,
    declaredSize: 214_958_080,
    title: 'SURVEY REPORT',
    sections: [
      'Site Attendance', 'Damage Assessment', 'Cause and Origin',
      'Salvage Valuation', 'Recommendations',
    ],
  },
  {
    key: 'documents/doc-policy-pack.pdf',
    filename: 'policy-wording.pdf',
    pages: 288,
    declaredSize: 104_857_600,
    title: 'POLICY WORDING',
    sections: [
      'Insuring Clause', 'Definitions', 'General Exclusions',
      'Conditions Precedent', 'Endorsements',
    ],
  },
]

/** Document id for a claim. One document per claim, so the mapping is direct. */
export function documentIdFor(claimId: string) {
  return `doc-${claimId}`
}
