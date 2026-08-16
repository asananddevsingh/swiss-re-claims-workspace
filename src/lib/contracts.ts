import { z } from 'zod'

export const CLAIM_STATUSES = [
  'New',
  'In Review',
  'Awaiting Docs',
  'Approved',
  'Rejected',
  'Settled',
] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export const CLAIM_TYPES = ['Property', 'Motor', 'Liability', 'Health', 'Marine'] as const
export const CHANNELS = ['Email', 'SFTP', 'Portal', 'API'] as const

export const SORT_FIELDS = ['updated_at', 'amount', 'claimant', 'status'] as const
export type SortField = (typeof SORT_FIELDS)[number]

/**
 * Grid query. Parsed from the URL on the server so a hand-crafted request
 * cannot smuggle an unexpected sort column into the SQL.
 */
export const gridQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(CLAIM_STATUSES).optional(),
  channel: z.enum(CHANNELS).optional(),
  type: z.enum(CLAIM_TYPES).optional(),
  sort: z.enum(SORT_FIELDS).default('updated_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
})
export type GridQuery = z.infer<typeof gridQuery>

export const claimPatch = z.object({
  claimant: z.string().trim().min(2).max(120).optional(),
  status: z.enum(CLAIM_STATUSES).optional(),
  amount: z.number().nonnegative().max(99_999_999).optional(),
})

export const assignBody = z.object({
  assigneeId: z.string().min(1).max(64).nullable(),
})

export const annotationCreate = z.object({
  pageIndex: z.number().int().min(0),
  kind: z.enum(['highlight', 'note', 'box']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  body: z.string().max(2000).optional(),
})

export const operationBody = z.object({
  kind: z.enum(['split', 'merge', 'delete_pages']),
  pages: z.array(z.number().int().min(0)).min(1).max(10_000),
  idempotencyKey: z.string().min(8).max(120),
})

export type Claim = {
  id: string
  claimRef: string
  claimant: string
  insured: string
  policyNo: string
  claimType: string
  channel: string
  amount: number
  currency: string
  status: ClaimStatus
  assigneeId: string | null
  assigneeName: string | null
  documentId: string | null
  updatedAt: string
}

export type GridResponse = {
  rows: Claim[]
  total: number
  totalIsEstimate: boolean
  page: number
  pageSize: number
  pageCount: number
  capabilities: string[]
  scope: string
}
