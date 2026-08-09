'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, TriangleAlert } from 'lucide-react'
import { Modal, Field, inputClass } from '@/components/ui/modal'
import { Button, StatusChip } from '@/components/ui/primitives'
import { CLAIM_STATUSES, type Claim, type ClaimStatus } from '@/lib/contracts'
import { cn } from '@/lib/cn'

export type DialogKind = 'edit' | 'assign' | 'delete'

type Result = { ok: true; message: string } | { ok: false; message: string }

async function send(url: string, method: string, body?: unknown): Promise<Result> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.ok) return { ok: true, message: '' }

  const err = (await res.json().catch(() => ({}))) as { error?: string }
  return { ok: false, message: `${res.status} — ${err.error ?? 'Rejected by server'}` }
}

/** Shared inline error strip, so a 403 is explained in the dialog that caused it. */
function ErrorNote({ message }: { message: string }) {
  return (
    <p className="mb-4 flex items-start gap-2 rounded-field bg-[#fff2f2] px-3 py-2.5 text-[12.5px] leading-snug text-bad">
      <TriangleAlert className="mt-px size-3.5 shrink-0" />
      {message}
    </p>
  )
}

export function EditClaimDialog({
  claim,
  onClose,
  onDone,
}: {
  claim: Claim
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [claimant, setClaimant] = useState(claim.claimant)
  const [status, setStatus] = useState<ClaimStatus>(claim.status)
  const [amount, setAmount] = useState(String(claim.amount))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const parsedAmount = Number(amount)
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 0
  const changed =
    claimant !== claim.claimant || status !== claim.status || parsedAmount !== claim.amount

  async function save() {
    setBusy(true)
    setError('')

    // Only changed fields are sent, so an edit never overwrites a field a
    // colleague changed while this dialog was open.
    const patch: Record<string, unknown> = {}
    if (claimant !== claim.claimant) patch.claimant = claimant.trim()
    if (status !== claim.status) patch.status = status
    if (parsedAmount !== claim.amount) patch.amount = parsedAmount

    const result = await send(`/api/claims/${claim.id}`, 'PATCH', patch)
    setBusy(false)

    if (result.ok) onDone(`${claim.claimRef} updated`)
    else setError(result.message)
  }

  return (
    <Modal
      open
      title="Edit claim"
      description={`${claim.claimRef} · ${claim.insured}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !changed || !amountValid}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Save changes
          </Button>
        </>
      }
    >
      {error && <ErrorNote message={error} />}

      <Field label="Claimant">
        <input
          className={inputClass}
          value={claimant}
          onChange={(e) => setClaimant(e.target.value)}
          minLength={2}
          maxLength={120}
        />
      </Field>

      <Field label="Status">
        <div className="flex flex-wrap gap-2">
          {CLAIM_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-chip transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                status === s ? 'ring-2 ring-brand ring-offset-1' : 'opacity-60 hover:opacity-100',
              )}
              aria-pressed={status === s}
            >
              <StatusChip status={s} />
            </button>
          ))}
        </div>
      </Field>

      <Field label={`Amount (${claim.currency})`} hint={amountValid ? undefined : 'Enter a number'}>
        <input
          className={inputClass}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
        />
      </Field>

      {!changed && (
        <p className="text-[12px] text-muted">Change a field to enable saving.</p>
      )}
    </Modal>
  )
}

export function AssignClaimDialog({
  claim,
  onClose,
  onDone,
}: {
  claim: Claim
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(claim.assigneeId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { data, isPending } = useQuery<{
    assignees: { id: string; name: string; team_id: string }[]
  }>({
    queryKey: ['assignees'],
    queryFn: async () => {
      const res = await fetch(`/api/claims/${claim.id}/assign`)
      if (!res.ok) throw new Error('Could not load assignees')
      return res.json()
    },
  })

  async function save() {
    setBusy(true)
    setError('')

    const result = await send(`/api/claims/${claim.id}/assign`, 'POST', { assigneeId: selected })
    setBusy(false)

    if (result.ok) {
      const name = data?.assignees.find((a) => a.id === selected)?.name
      onDone(name ? `${claim.claimRef} assigned to ${name}` : `${claim.claimRef} unassigned`)
    } else {
      setError(result.message)
    }
  }

  return (
    <Modal
      open
      title="Assign claim"
      description={`${claim.claimRef} · currently ${claim.assigneeName ?? 'unassigned'}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || selected === claim.assigneeId}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Assign
          </Button>
        </>
      }
    >
      {error && <ErrorNote message={error} />}

      {isPending ? (
        <p className="py-6 text-center text-[13px] text-muted">Loading adjudicators…</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {data?.assignees.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={cn(
                'flex items-center gap-3 rounded-field border px-3 py-2.5 text-left text-[14px] transition',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                selected === a.id
                  ? 'border-brand bg-brand-soft font-semibold text-brand'
                  : 'border-line hover:border-[#d5d7e3]',
              )}
              aria-pressed={selected === a.id}
            >
              <span>{a.name}</span>
              <span className="ml-auto text-[12px] text-muted">{a.team_id}</span>
            </button>
          ))}

          <button
            onClick={() => setSelected(null)}
            className={cn(
              'mt-1 rounded-field border px-3 py-2.5 text-left text-[14px] transition',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              selected === null
                ? 'border-brand bg-brand-soft font-semibold text-brand'
                : 'border-line text-nav hover:border-[#d5d7e3]',
            )}
            aria-pressed={selected === null}
          >
            Leave unassigned
          </button>
        </div>
      )}

      <p className="mt-4 text-[11.5px] leading-snug text-muted">
        A supervisor may only assign within their own team. Anything else is refused by the server,
        not hidden here.
      </p>
    </Modal>
  )
}

export function DeleteClaimDialog({
  claim,
  onClose,
  onDone,
}: {
  claim: Claim
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const matches = confirmation.trim().toUpperCase() === claim.claimRef.toUpperCase()

  async function remove() {
    setBusy(true)
    setError('')

    const result = await send(`/api/claims/${claim.id}`, 'DELETE')
    setBusy(false)

    if (result.ok) onDone(`${claim.claimRef} deleted`)
    else setError(result.message)
  }

  return (
    <Modal
      open
      width="sm"
      title="Delete claim"
      description="This removes the claim from the queue. It cannot be undone."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy || !matches}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Delete claim
          </Button>
        </>
      }
    >
      {error && <ErrorNote message={error} />}

      <div className="mb-4 rounded-field bg-field px-3 py-3 text-[13px]">
        <p className="font-semibold">{claim.claimant}</p>
        <p className="mt-0.5 text-nav">
          {claim.claimRef} · {claim.insured} · {claim.currency}{' '}
          {claim.amount.toLocaleString('en-CH', { maximumFractionDigits: 0 })}
        </p>
      </div>

      {/*
        Typing the reference is friction on purpose. Deletion is the one action
        here with no undo, and the confirm-by-name pattern is the cheapest way
        to stop a misclick on the wrong row.
      */}
      <Field label="Type the claim reference to confirm" hint={claim.claimRef}>
        <input
          className={inputClass}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={claim.claimRef}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
    </Modal>
  )
}
