import Link from 'next/link'
import { ArrowRight, HardHat } from 'lucide-react'

/**
 * Placeholder for navigation that exists in the design but is outside the
 * scope of this case study. Naming what each section would do is more useful
 * than a dead link.
 */
export function UnderConstruction({
  title,
  summary,
  planned,
}: {
  title: string
  summary: string
  planned: string[]
}) {
  return (
    <div className="mx-auto max-w-2xl py-10 sm:py-20">
      <div className="rounded-[var(--radius-card)] bg-white p-7 shadow-[0_10px_60px_rgba(226,236,249,0.5)] sm:p-10">
        <span className="mb-5 inline-flex size-14 items-center justify-center rounded-full bg-[linear-gradient(150deg,var(--color-ok-from),var(--color-ok-to))]">
          <HardHat className="size-6 text-ok-ink" strokeWidth={1.6} />
        </span>

        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-brand">
          Under construction
        </p>
        <h1 className="mb-3 text-[26px] font-bold leading-tight tracking-[-0.015em] sm:text-[30px]">
          {title}
        </h1>
        <p className="mb-7 text-[15px] leading-relaxed text-nav">{summary}</p>

        <div className="mb-8 border-t border-line pt-6">
          <p className="mb-3 text-[13px] font-semibold">What this section would cover</p>
          <ul className="flex flex-col gap-2">
            {planned.map((item) => (
              <li key={item} className="flex gap-2.5 text-[14px] text-ink-soft">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mb-5 text-[13px] leading-relaxed text-muted">
          The case study scope is the claims queue and the document workspace. This route exists
          because it appears in the supplied navigation design — building it out would add surface
          without demonstrating anything the brief asks about.
        </p>

        <Link
          href="/claims"
          className="inline-flex items-center gap-2 rounded-field bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Go to claims queue
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  )
}
