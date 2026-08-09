'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Dialog with the behaviour people expect: Escape closes it, focus moves in on
 * open and returns to the trigger on close, and background content is inert to
 * screen readers while it is up.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 'md',
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    restoreTo.current = document.activeElement as HTMLElement

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus the first control rather than the panel, so keyboard users land
    // where they can act.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([data-close])',
    )
    focusable?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      restoreTo.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(41,45,50,0.42)] p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-[0_24px_80px_rgba(41,45,50,0.28)] sm:rounded-2xl',
          width === 'sm' ? 'sm:max-w-[420px]' : 'sm:max-w-[520px]',
        )}
      >
        <div className="mb-5 flex items-start gap-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-[18px] font-bold tracking-[-0.01em]">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[13px] leading-snug text-nav">{description}</p>
            )}
          </div>
          <button
            data-close
            onClick={onClose}
            aria-label="Close"
            className="ml-auto shrink-0 rounded-md p-1 text-muted transition hover:bg-field hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            <X className="size-4" />
          </button>
        </div>

        {children}

        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-field border border-line bg-field px-3 py-2.5 text-[14px] text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand'
