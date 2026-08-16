export type Annotation = {
  id: string
  pageIndex: number
  kind: 'highlight' | 'note' | 'box'
  x: number
  y: number
  w: number
  h: number
  body: string | null
  authorId: string
  authorName: string | null
  createdAt: string
}

export type Manifest = {
  id: string
  filename: string
  version: number
  pageCount: number
  declaredSize: number
  actualSize: number
  available: boolean
  streamUrl: string
  pageSize: { width: number; height: number }
  capabilities: string[]
}

export type Job = {
  id: string
  kind: 'split' | 'merge' | 'delete_pages'
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  progress: number
  totalPages: number
  message: string | null
  createdAt: string
}

export type DocumentVersion = {
  id: string
  filename: string
  pageCount: number
  byteSize: number
  version: number
  createdAt: string
  /** Job output lives on the writable path a serverless host provides, which is per-instance. */
  available: boolean
}
