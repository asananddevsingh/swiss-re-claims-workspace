/* eslint-disable jsx-a11y/role-supports-aria-props */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Pencil, Trash2, UserPlus, FileText, ArrowUpDown } from 'lucide-react'
import { Card, StatusChip, SearchField, Select, Button } from '@/components/ui/primitives'
import { CLAIM_STATUSES, CHANNELS, type Claim, type GridResponse } from '@/lib/contracts'
import {
  EditClaimDialog,
  AssignClaimDialog,
  DeleteClaimDialog,
  type DialogKind,
} from './claim-dialogs'
import { cn } from '@/lib/cn'

const PAGE_SIZE = 50
const ROW_HEIGHT = 62

/*
 * Column widths live outside the component so the template string is allocated
 * once rather than on every render pass.
 */
const COLUMNS = [
  { key: 'claimant', label: 'Claimant', sortable: true, width: '1.5fr' },
  { key: 'insured', label: 'Insured', sortable: false, width: '1.5fr' },
  { key: 'claimRef', label: 'Claim Ref', sortable: false, width: '1.1fr' },
  { key: 'amount', label: 'Amount', sortable: true, width: '1fr' },
  { key: 'channel', label: 'Channel', sortable: false, width: '0.8fr' },
  { key: 'assignee', label: 'Assignee', sortable: false, width: '1.1fr' },
  { key: 'status', label: 'Status', sortable: true, width: '1fr' },
  { key: 'actions', label: '', sortable: false, width: '108px' },
] as const

const TEMPLATE = COLUMNS.map((c) => c.width).join(' ')

const money = new Intl.NumberFormat('en-CH', { maximumFractionDigits: 0 })

type Toast = { id: number; tone: 'ok' | 'bad'; text: string }

export function ClaimsGrid() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [sort, setSort] = useState<'updated_at' | 'amount' | 'claimant' | 'status'>('updated_at')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [bypassUi, setBypassUi] = useState(false)
  const [dialog, setDialog] = useState<{ kind: DialogKind; claim: Claim } | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const scrollRef = useRef<HTMLDivElement>(null)

  // Keystrokes become one request, not one per character.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const params = useMemo(() => {
    const p = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort,
      dir,
    })
    if (debounced) p.set('q', debounced)
    if (status) p.set('status', status)
    if (channel) p.set('channel', channel)
    return p.toString()
  }, [page, sort, dir, debounced, status, channel])

  const { data, isFetching, isPending } = useQuery<GridResponse>({
    queryKey: ['claims', params],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/claims?${params}`, { signal })
      if (!res.ok) throw new Error('Could not load claims')
      return res.json()
    },
    // Keeps the previous page on screen while the next one loads, so paging
    // never flashes an empty table.
    placeholderData: (prev) => prev,
  })

  const rows = data?.rows ?? []
  const caps = data?.capabilities ?? []

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [params])

  const pushToast = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, tone, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [])

  const toggleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (prev === key) return prev
      return key as typeof sort
    })
    setDir((prev) => (sort === key ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'))
    setPage(1)
  }, [sort])

  /**
   * Every mutation refetches the queue rather than patching the cache by hand.
   * An edit can change what a row sorts or filters by, and a delete changes the
   * total — so the server's answer is the one worth showing.
   */
  function completeAction(message: string) {
    setDialog(null)
    pushToast('ok', message)
    queryClient.invalidateQueries({ queryKey: ['claims'] })
  }

  const total = data?.total ?? 0
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)
  const pageCount = data?.pageCount ?? 1

  return (
    <Card className="p-5 sm:p-8">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold tracking-[-0.01em]">All Claims</h2>
          <p className="mt-1 text-[14px] font-medium text-ok-mid">
            {data?.scope ?? 'Loading scope…'}
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <SearchField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search claimant, ref, policy"
            aria-label="Search claims"
            className="w-full sm:w-[240px]"
          />
          <Select
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v)
              setPage(1)
            }}
            options={[
              { value: '', label: 'All' },
              ...CLAIM_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Select
            label="Channel"
            value={channel}
            onChange={(v) => {
              setChannel(v)
              setPage(1)
            }}
            options={[
              { value: '', label: 'All' },
              ...CHANNELS.map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>
      </div>

      {/*
        Header and body share one horizontal scroll container so the columns
        stay aligned when the table is wider than the viewport. Vertical scroll
        stays on the body alone, which keeps the header in view without needing
        position: sticky against a virtualised list.
      */}
      <div className="scroll-slim -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <div className="min-w-[1040px]">
          <div
            role="row"
            className="grid items-center gap-4 border-b border-line pb-3 text-[14px] text-muted"
            style={{ gridTemplateColumns: TEMPLATE }}
          >
            {COLUMNS.map((col) => (
              <div
                key={col.key}
                role="columnheader"
                className={col.key === 'actions' ? 'text-right' : ''}
              >
                {col.sortable ? (
                  <button
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded transition hover:text-ink',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                      sort === col.key && 'font-semibold text-ink',
                    )}
                    aria-sort={
                      sort === col.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    {col.label}
                    <ArrowUpDown className="size-3.5" />
                  </button>
                ) : (
                  col.label
                )}
              </div>
            ))}
          </div>

          {/* Virtualised body: 50 rows arrive, ~14 are ever mounted. */}
          <div
            ref={scrollRef}
            className="scroll-slim relative overflow-y-auto"
            style={{ height: 'clamp(340px, 58vh, 620px)' }}
            role="rowgroup"
          >
            {isPending ? (
              <SkeletonRows />
            ) : rows.length === 0 ? (
              <p className="py-20 text-center text-[14px] text-muted">
                No claims match these filters.
              </p>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const claim = rows[vi.index]
                  return (
                    <ClaimRow
                      key={claim.id}
                      claim={claim}
                      caps={caps}
                      bypassUi={bypassUi}
                      top={vi.start}
                      height={vi.size}
                      onOpen={() => router.push(`/claims/${claim.id}`)}
                      onOpenDialog={(kind) => setDialog({ kind, claim })}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <p className="text-[14px] text-muted">
          Showing data {money.format(from)} to {money.format(to)} of{' '}
          {/*
            Only very large result sets fall back to the planner estimate. When
            they do, the tilde carries it — a number that is close is normal at
            that scale, whereas an "(approx.)" tag beside an exact figure reads
            as though the data itself is unreliable.
          */}
          <span
            className={cn('tabular-nums', data?.totalIsEstimate && 'cursor-help')}
            title={
              data?.totalIsEstimate
                ? 'Estimated from table statistics. Exact counting is used below 50,000 rows; beyond that it would run on every keystroke.'
                : undefined
            }
          >
            {data?.totalIsEstimate ? '~' : ''}
            {money.format(total)}
          </span>{' '}
          entries
          {isFetching && <span className="ml-2 text-brand">updating…</span>}
        </p>

        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>

      {/* Proof that the client check is cosmetic. */}
      <label className="mt-5 flex w-fit cursor-pointer items-center gap-2 rounded-field bg-field px-3 py-2 text-[12.5px] text-nav">
        <input
          type="checkbox"
          checked={bypassUi}
          onChange={(e) => setBypassUi(e.target.checked)}
          className="accent-brand"
        />
        Ignore client-side permission checks — actions stay enabled and the server still decides
      </label>

      {dialog?.kind === 'edit' && (
        <EditClaimDialog
          claim={dialog.claim}
          onClose={() => setDialog(null)}
          onDone={completeAction}
        />
      )}
      {dialog?.kind === 'assign' && (
        <AssignClaimDialog
          claim={dialog.claim}
          onClose={() => setDialog(null)}
          onDone={completeAction}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteClaimDialog
          claim={dialog.claim}
          onClose={() => setDialog(null)}
          onDone={completeAction}
        />
      )}

      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'rounded-field px-4 py-3 text-[13px] font-medium text-white shadow-lg',
              t.tone === 'ok' ? 'bg-ok-ink' : 'bg-bad',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Card>
  )
}

function ClaimRow({
  claim,
  caps,
  bypassUi,
  top,
  height,
  onOpen,
  onOpenDialog,
}: {
  claim: Claim
  caps: string[]
  bypassUi: boolean
  top: number
  height: number
  onOpen: () => void
  onOpenDialog: (kind: DialogKind) => void
}) {
  const allow = (cap: string) => bypassUi || caps.includes(cap)

  return (
    <div
      role="row"
      className="absolute left-0 grid w-full items-center gap-4 border-b border-line text-[14px]"
      style={{ top, height, gridTemplateColumns: TEMPLATE }}
    >
      <button
        onClick={onOpen}
        className="flex items-center gap-2 truncate text-left font-medium hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <FileText className="size-[15px] shrink-0 text-muted" />
        <span className="truncate">{claim.claimant}</span>
      </button>
      <div className="truncate text-ink">{claim.insured}</div>
      <div className="truncate tabular-nums text-ink">{claim.claimRef}</div>
      <div className="tabular-nums text-ink">
        {claim.currency} {money.format(claim.amount)}
      </div>
      <div className="text-nav">{claim.channel}</div>
      <div className="truncate text-nav">{claim.assigneeName ?? '—'}</div>
      <div>
        <StatusChip status={claim.status} />
      </div>
      <div className="flex justify-end gap-1">
        <RowAction
          icon={Pencil}
          label="Edit"
          enabled={allow('claims.edit')}
          missing="claims.edit"
          onClick={() => onOpenDialog('edit')}
        />
        <RowAction
          icon={UserPlus}
          label="Assign"
          enabled={allow('claims.assign')}
          missing="claims.assign"
          onClick={() => onOpenDialog('assign')}
        />
        <RowAction
          icon={Trash2}
          label="Delete"
          enabled={allow('claims.delete')}
          missing="claims.delete"
          danger
          onClick={() => onOpenDialog('delete')}
        />
      </div>
    </div>
  )
}

function RowAction({
  icon: Icon,
  label,
  enabled,
  missing,
  danger,
  onClick,
}: {
  icon: typeof Pencil
  label: string
  enabled: boolean
  missing: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      aria-label={label}
      title={enabled ? label : `${label} — requires ${missing}`}
      className={cn(
        'rounded-md p-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
        enabled
          ? danger
            ? 'text-muted hover:bg-[#fff0f0] hover:text-bad'
            : 'text-muted hover:bg-field hover:text-brand'
          : 'cursor-not-allowed text-muted opacity-38',
      )}
    >
      <Icon className="size-[15px]" />
    </button>
  )
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3 pt-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-[46px] animate-pulse rounded-lg bg-field"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  )
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (p: number) => void
}) {
  const pages = useMemo(() => {
    const out: (number | '…')[] = []
    const push = (n: number) => out.push(n)

    if (pageCount <= 7) {
      for (let i = 1; i <= pageCount; i++) push(i)
      return out
    }

    push(1)
    if (page > 4) out.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(pageCount - 1, page + 1); i++) push(i)
    if (page < pageCount - 3) out.push('…')
    push(pageCount)
    return out
  }, [page, pageCount])

  return (
    <nav className="flex items-center gap-2" aria-label="Pagination">
      <Button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous page"
        className="px-2.5 py-1.5"
      >
        ‹
      </Button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-[13px] text-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(
              'min-w-[30px] rounded-[6px] px-2 py-1.5 text-[13px] font-medium transition tabular-nums',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              p === page
                ? 'bg-brand text-white'
                : 'bg-idle text-faint hover:text-ink',
            )}
          >
            {p}
          </button>
        ),
      )}
      <Button
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page >= pageCount}
        aria-label="Next page"
        className="px-2.5 py-1.5"
      >
        ›
      </Button>
    </nav>
  )
}
