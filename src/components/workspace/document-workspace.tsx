'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  Scissors, Trash2, MessageSquarePlus, X, Loader2,
  ZoomIn, ZoomOut, CircleAlert, CircleCheck, FileStack,
} from 'lucide-react'
import { openDocument } from '@/lib/pdf'
import { PdfPage } from './pdf-page'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import type { Annotation, Manifest, Job, DocumentVersion } from '@/lib/contracts-client'

const GAP = 22
const ZOOMS = [420, 560, 700, 860, 1040]

/**
 * Stable 32-bit hash of a page selection.
 *
 * The idempotency key has to identify a selection without containing it —
 * embedding the page list directly produced a 10,000-character key for a
 * whole-document operation, which the request schema rightly rejected.
 * Same selection in, same key out, which is all the server needs.
 */
function hashPages(pages: number[]): string {
  let h = 0x811c9dc5
  for (const p of pages) {
    h ^= p
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function DocumentWorkspace({
  documentId,
  claimRef,
}: {
  documentId: string
  claimRef: string
}) {
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(2)
  const [drawing, setDrawing] = useState(false)
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const [job, setJob] = useState<(Job & { live?: boolean }) | null>(null)

  // 1 — the manifest lands first and is enough to lay the whole document out.
  const { data: manifest } = useQuery<Manifest>({
    queryKey: ['manifest', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/manifest`)
      if (!res.ok) throw new Error('Could not load manifest')
      return res.json()
    },
  })

  const { data: annotationData } = useQuery<{ annotations: Annotation[] }>({
    queryKey: ['annotations', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/annotations`)
      if (!res.ok) throw new Error('Could not load annotations')
      return res.json()
    },
  })

  const annotations = annotationData?.annotations ?? []
  const caps = manifest?.capabilities ?? []

  // 2 — only once the layout exists do we open the byte stream.
  useEffect(() => {
    if (!manifest?.available) return
    let cancelled = false

    openDocument(manifest.streamUrl)
      .then(({ doc }) => {
        if (cancelled) return
        setDoc(doc)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message ?? 'Could not open document')
      })

    return () => {
      cancelled = true
    }
  }, [manifest?.available, manifest?.streamUrl])

  // The viewer column is narrower than the chosen zoom on small screens, so the
  // page is clamped to what actually fits rather than overflowing the card.
  const [viewportWidth, setViewportWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const pageWidth = viewportWidth
    ? Math.min(ZOOMS[zoom], Math.max(240, viewportWidth - 32))
    : ZOOMS[zoom]

  const pageHeight = manifest
    ? (manifest.pageSize.height / manifest.pageSize.width) * pageWidth + 22
    : 800

  const virtualizer = useVirtualizer({
    count: manifest?.pageCount ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => pageHeight + GAP,
    overscan: 2,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [pageWidth, virtualizer])

  const byPage = useMemo(() => {
    const map = new Map<number, Annotation[]>()
    for (const a of annotations) {
      const list = map.get(a.pageIndex)
      if (list) list.push(a)
      else map.set(a.pageIndex, [a])
    }
    return map
  }, [annotations])

  const addAnnotation = useCallback(
    async (pageIndex: number, rect: { x: number; y: number; w: number; h: number }) => {
      const body = prompt(`Comment on page ${pageIndex + 1}`)
      if (body === null) return

      const res = await fetch(`/api/documents/${documentId}/annotations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageIndex, kind: 'note', ...rect, body }),
      })

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['annotations', documentId] })
      } else {
        const err = await res.json().catch(() => ({}))
        alert(`${res.status} — ${err.error ?? 'Annotation rejected'}`)
      }
    },
    [documentId, queryClient],
  )

  const removeAnnotation = useCallback(
    async (id: string) => {
      if (!confirm('Delete this annotation?')) return
      await fetch(`/api/documents/${documentId}/annotations?annotationId=${id}`, {
        method: 'DELETE',
      })
      queryClient.invalidateQueries({ queryKey: ['annotations', documentId] })
    },
    [documentId, queryClient],
  )

  const togglePage = useCallback((pageIndex: number) => {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(pageIndex)) next.delete(pageIndex)
      else next.add(pageIndex)
      return next
    })
  }, [])

  async function submitOperation(kind: 'split' | 'delete_pages') {
    const pages = [...selection].sort((a, b) => a - b)
    if (!pages.length) return

    const res = await fetch(`/api/documents/${documentId}/operations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        pages,
        // Stable per intent, so a retry after a network blip replays rather
        // than running the operation a second time.
        idempotencyKey: `${documentId}:${kind}:${pages.length}:${hashPages(pages)}`,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`${res.status} — ${err.error ?? 'Operation rejected'}`)
      return
    }

    const { jobId } = await res.json()
    setJob({
      id: jobId,
      kind,
      status: 'queued',
      progress: 0,
      totalPages: pages.length,
      message: null,
      createdAt: new Date().toISOString(),
      live: true,
    })

    const source = new EventSource(`/api/jobs/${jobId}/events`)
    source.addEventListener('progress', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      setJob((prev) => (prev ? { ...prev, ...data } : prev))
      if (['done', 'failed', 'cancelled'].includes(data.status)) {
        source.close()
        if (data.status === 'done') setSelection(new Set())
      }
    })
    source.addEventListener('error', () => source.close())
  }

  async function cancelJob() {
    if (!job) return
    await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
  }

  if (manifest && !manifest.available) {
    return (
      <div className="rounded-2xl border border-[#ffd9d9] bg-[#fff7f7] p-6 text-[14px]">
        <p className="mb-1 font-semibold text-bad">Document bytes unavailable</p>
        <p className="text-nav">
          The catalogue lists {manifest.pageCount.toLocaleString()} pages but no object is present
          in storage for this document. Run{' '}
          <code className="rounded bg-white px-1.5 py-0.5">npx tsx scripts/make-bundle.ts</code> to
          build the fixture.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 rounded-2xl bg-white p-3 shadow-[0_10px_60px_rgba(226,236,249,0.5)] sm:p-4">
        <Toolbar
          manifest={manifest}
          doc={doc}
          zoom={zoom}
          setZoom={setZoom}
          drawing={drawing}
          setDrawing={setDrawing}
          canAnnotate={caps.includes('documents.annotate')}
          selectionCount={selection.size}
          onClearSelection={() => setSelection(new Set())}
        />

        {loadError && (
          <p className="mb-3 rounded-lg bg-[#fff0f0] px-4 py-2.5 text-[13px] text-bad">
            {loadError}
          </p>
        )}

        <div
          ref={scrollRef}
          className="scroll-slim relative overflow-auto rounded-xl bg-canvas"
          style={{ height: 'clamp(380px, calc(100vh - 300px), 900px)' }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => (
              <PdfPage
                key={vi.key}
                doc={doc}
                pageNumber={vi.index + 1}
                width={pageWidth}
                height={pageHeight}
                top={vi.start + GAP / 2}
                annotations={byPage.get(vi.index) ?? []}
                drawing={drawing}
                onDraw={addAnnotation}
                onSelectAnnotation={removeAnnotation}
              />
            ))}
          </div>
        </div>

        <p className="mt-3 text-center text-[12px] text-muted">
          {manifest
            ? `${manifest.pageCount.toLocaleString()} pages · only the pages in view are fetched and rendered`
            : 'Loading manifest…'}
        </p>
      </div>

      <SidePanel
        documentId={documentId}
        claimRef={claimRef}
        manifest={manifest}
        annotations={annotations}
        selection={selection}
        onTogglePage={togglePage}
        canSplit={caps.includes('documents.split')}
        job={job}
        onSplit={() => submitOperation('split')}
        onDeletePages={() => submitOperation('delete_pages')}
        onCancel={cancelJob}
        onDismissJob={() => setJob(null)}
      />
    </div>
  )
}

function Toolbar({
  manifest,
  doc,
  zoom,
  setZoom,
  drawing,
  setDrawing,
  canAnnotate,
  selectionCount,
  onClearSelection,
}: {
  manifest?: Manifest
  doc: PDFDocumentProxy | null
  zoom: number
  setZoom: (z: number) => void
  drawing: boolean
  setDrawing: (d: boolean) => void
  canAnnotate: boolean
  selectionCount: number
  onClearSelection: () => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
      <span className="mr-auto flex items-center gap-2 text-[13px] font-semibold">
        {manifest?.filename ?? 'Loading…'}
        {!doc && manifest?.available && (
          <Loader2 className="size-3.5 animate-spin text-brand" />
        )}
      </span>

      {selectionCount > 0 && (
        <button
          onClick={onClearSelection}
          className="rounded-full bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand"
        >
          {selectionCount} selected · clear
        </button>
      )}

      <Button
        onClick={() => setDrawing(!drawing)}
        disabled={!canAnnotate}
        variant={drawing ? 'primary' : 'ghost'}
        title={canAnnotate ? 'Drag on a page to add a comment' : 'Requires documents.annotate'}
      >
        <MessageSquarePlus className="size-4" />
        {drawing ? 'Drawing — drag on a page' : 'Comment'}
      </Button>

      <div className="flex items-center gap-1">
        <Button
          onClick={() => setZoom(Math.max(0, zoom - 1))}
          disabled={zoom === 0}
          aria-label="Zoom out"
          className="px-2"
        >
          <ZoomOut className="size-4" />
        </Button>
        <Button
          onClick={() => setZoom(Math.min(ZOOMS.length - 1, zoom + 1))}
          disabled={zoom === ZOOMS.length - 1}
          aria-label="Zoom in"
          className="px-2"
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function SidePanel({
  documentId,
  claimRef,
  manifest,
  annotations,
  selection,
  onTogglePage,
  canSplit,
  job,
  onSplit,
  onDeletePages,
  onCancel,
  onDismissJob,
}: {
  documentId: string
  claimRef: string
  manifest?: Manifest
  annotations: Annotation[]
  selection: Set<number>
  onTogglePage: (i: number) => void
  canSplit: boolean
  job: (Job & { live?: boolean }) | null
  onSplit: () => void
  onDeletePages: () => void
  onCancel: () => void
  onDismissJob: () => void
}) {
  const [pageInput, setPageInput] = useState('')

  return (
    <aside className="flex flex-col gap-4">
      <section className="rounded-2xl bg-white p-5 shadow-[0_10px_60px_rgba(226,236,249,0.5)]">
        <h3 className="mb-3 text-[14px] font-bold">Document</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[12.5px]">
          <dt className="text-muted">Claim</dt>
          <dd className="tabular-nums">{claimRef}</dd>
          <dt className="text-muted">Pages</dt>
          <dd className="tabular-nums">{manifest?.pageCount.toLocaleString() ?? '—'}</dd>
          <dt className="text-muted">Catalogue size</dt>
          <dd className="tabular-nums">
            {manifest ? `${(manifest.declaredSize / 1_048_576).toFixed(0)} MB` : '—'}
          </dd>
          <dt className="text-muted">Fetched so far</dt>
          <dd className="tabular-nums text-ok-ink">visible pages only</dd>
          <dt className="text-muted">Version</dt>
          <dd className="tabular-nums">v{manifest?.version ?? 1}</dd>
        </dl>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-[0_10px_60px_rgba(226,236,249,0.5)]">
        <h3 className="mb-1 text-[14px] font-bold">Page operations</h3>
        <p className="mb-3 text-[12px] leading-snug text-nav">
          Select pages, then split them into a new document or remove them. The source is never
          modified — the worker writes a new version.
        </p>

        <div className="mb-3 flex gap-2">
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder="e.g. 1-8, 42"
            aria-label="Page range"
            className="w-full rounded-field bg-field px-3 py-2 text-[12.5px] focus:outline-2 focus:outline-brand"
          />
          <Button
            onClick={() => {
              for (const part of pageInput.split(',')) {
                const [a, b] = part.trim().split('-').map((n) => parseInt(n, 10))
                if (Number.isNaN(a)) continue
                const end = Number.isNaN(b) ? a : b
                for (let p = a; p <= end; p++) {
                  if (p >= 1 && p <= (manifest?.pageCount ?? 0)) onTogglePage(p - 1)
                }
              }
              setPageInput('')
            }}
          >
            Add
          </Button>
        </div>

        {selection.size > 0 && (
          <p className="mb-3 max-h-16 overflow-auto text-[12px] text-nav">
            Pages:{' '}
            {[...selection]
              .sort((a, b) => a - b)
              .map((p) => p + 1)
              .join(', ')}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1 justify-center"
            disabled={!canSplit || selection.size === 0 || job?.status === 'running'}
            onClick={onSplit}
            title={canSplit ? 'Split selected pages out' : 'Requires documents.split'}
          >
            <Scissors className="size-4" /> Split
          </Button>
          <Button
            variant="danger"
            className="flex-1 justify-center"
            disabled={!canSplit || selection.size === 0 || job?.status === 'running'}
            onClick={onDeletePages}
            title={canSplit ? 'Remove selected pages' : 'Requires documents.split'}
          >
            <Trash2 className="size-4" /> Remove
          </Button>
        </div>

        {job && <JobCard job={job} onCancel={onCancel} onDismiss={onDismissJob} />}
      </section>

      <VersionsPanel documentId={documentId} jobStatus={job?.status} />

      <section className="rounded-2xl bg-white p-5 shadow-[0_10px_60px_rgba(226,236,249,0.5)]">
        <h3 className="mb-3 text-[14px] font-bold">
          Comments{' '}
          <span className="font-normal text-muted">({annotations.length})</span>
        </h3>
        {annotations.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            No comments yet. Use Comment, then drag a box on any page.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-3 overflow-auto">
            {annotations.map((a) => (
              <li key={a.id} className="border-l-2 border-brand pl-3">
                <p className="text-[12px] font-semibold text-brand">
                  Page {a.pageIndex + 1}
                </p>
                <p className="text-[12.5px] leading-snug text-ink">{a.body}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {a.authorName ?? a.authorId}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

function JobCard({
  job,
  onCancel,
  onDismiss,
}: {
  job: Job & { live?: boolean }
  onCancel: () => void
  onDismiss: () => void
}) {
  const running = job.status === 'queued' || job.status === 'running'

  return (
    <div className="mt-4 rounded-xl border border-line bg-field p-3">
      <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold">
        {running && <Loader2 className="size-3.5 animate-spin text-brand" />}
        {job.status === 'done' && <CircleCheck className="size-3.5 text-ok-ink" />}
        {(job.status === 'failed' || job.status === 'cancelled') && (
          <CircleAlert className="size-3.5 text-bad" />
        )}
        <span className="capitalize">
          {job.kind.replace('_', ' ')} — {job.status}
        </span>
        <button onClick={onDismiss} className="ml-auto text-muted" aria-label="Dismiss">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            job.status === 'failed' || job.status === 'cancelled'
              ? 'bg-bad'
              : 'bg-brand',
          )}
          style={{ width: `${job.progress}%` }}
        />
      </div>

      <p className="text-[11.5px] leading-snug text-nav">
        {job.message ?? `${job.progress}% of ${job.totalPages} pages`}
      </p>

      {running && (
        <button
          onClick={onCancel}
          className="mt-2 text-[12px] font-semibold text-bad hover:underline"
        >
          Cancel
        </button>
      )}
    </div>
  )
}

/**
 * Outputs produced by page operations on this document.
 *
 * Refetches when a job reaches a terminal state, so a completed split appears
 * without a reload — the difference between "the job said it worked" and being
 * able to see and open the result.
 */
function VersionsPanel({
  documentId,
  jobStatus,
}: {
  documentId: string
  jobStatus?: Job['status']
}) {
  const { data } = useQuery<{ versions: DocumentVersion[] }>({
    queryKey: ['versions', documentId, jobStatus === 'done' ? 'done' : 'idle'],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/versions`)
      if (!res.ok) throw new Error('Could not load versions')
      return res.json()
    },
  })

  const versions = data?.versions ?? []
  if (!versions.length) return null

  return (
    <section className="rounded-2xl bg-white p-5 shadow-[0_10px_60px_rgba(226,236,249,0.5)]">
      <h3 className="mb-1 text-[14px] font-bold">
        Operation output <span className="font-normal text-muted">({versions.length})</span>
      </h3>
      <p className="mb-3 text-[12px] leading-snug text-nav">
        Each split or removal writes a new document. The source above is unchanged.
      </p>

      <ul className="flex flex-col gap-2">
        {versions.map((v) => (
          <li key={v.id}>
            <a
              href={`/documents/${v.id}`}
              className="block rounded-field border border-line px-3 py-2.5 transition hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span className="flex items-center gap-2">
                <FileStack className="size-3.5 shrink-0 text-brand" />
                <span className="text-[13px] font-semibold tabular-nums">
                  {v.pageCount.toLocaleString()} pages
                </span>
                <span className="ml-auto text-[11px] text-muted">v{v.version}</span>
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                {v.filename}
              </span>
              {!v.available && (
                <span className="mt-1 block text-[11px] leading-snug text-[#9a6700]">
                  Row recorded, bytes not on this instance — job output is written to the only
                  writable path a serverless host has.
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
