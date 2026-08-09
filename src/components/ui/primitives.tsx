import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-card bg-white shadow-[0_10px_60px_rgba(226,236,249,0.5)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Status chip. The Figma ships two variants (Active / Inactive); claim workflow
 * needs six, so the palette is extended along the same axis — saturated ink on a
 * tinted ground, 6px radius, 1px border of the same hue.
 */
const STATUS_STYLE: Record<string, string> = {
  Approved: 'bg-[#e5fbf1] text-[#008767] border-[#00b087]',
  Settled: 'bg-[#e5fbf1] text-[#008767] border-[#00b087]',
  'In Review': 'bg-[#f2effe] text-[#4925e9] border-[#8f77f0]',
  New: 'bg-[#eef4ff] text-[#2563c9] border-[#7ba4e8]',
  'Awaiting Docs': 'bg-[#fff6e5] text-[#9a6700] border-[#e0b450]',
  Rejected: 'bg-[#ffc5c5] text-[#df0404] border-[#df0404]',
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[80px] justify-center rounded-chip border px-3 py-[3px] text-[12px] font-semibold',
        STATUS_STYLE[status] ?? 'border-[#b5b7c0] bg-[#f5f5f5] text-[#7e7e7e]',
      )}
    >
      {status}
    </span>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'ghost', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded-field px-3.5 py-2 text-[13px] font-medium transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-38',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-deep',
        variant === 'ghost' && 'border border-line bg-white text-ink-soft hover:border-[#d5d7e3]',
        variant === 'danger' && 'border border-[#ffc5c5] bg-white text-bad hover:bg-[#fff5f5]',
        className,
      )}
      {...props}
    />
  )
}

export function SearchField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" strokeLinecap="round" />
      </svg>
      <input
        className="w-full rounded-field bg-field py-2.5 pl-10 pr-3 text-[13px] text-ink placeholder:text-muted focus:outline-2 focus:outline-offset-1 focus:outline-brand"
        {...props}
      />
    </div>
  )
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-field bg-field px-3 py-2 text-[13px]">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer bg-transparent font-semibold text-ink focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Avatar({ name, hue, size = 36 }: { name: string; hue: number; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')

  return (
    <span
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, hsl(${hue} 72% 68%), hsl(${hue + 24} 68% 52%))`,
        fontSize: size * 0.36,
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
