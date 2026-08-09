'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  ShieldCheck,
  CircleHelp,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Avatar } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { ROLE_LABELS, type Role } from '@/lib/policy'

const NAV = [
  { href: '/claims', label: 'Claims', icon: FolderOpen },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/audit', label: 'Audit', icon: ShieldCheck },
  { href: '/help', label: 'Help', icon: CircleHelp },
]

export function Sidebar({
  user,
}: {
  user: { name: string; role: Role; hue: number }
}) {
  const pathname = usePathname()
  // Collapsed by default so the queue gets the width on small screens; the
  // preference is remembered for the session once a user changes it.
  const [collapsed, setCollapsed] = useState(true)

  return (
    <aside
      className={cn(
        'sticky top-0 z-20 flex h-screen shrink-0 flex-col bg-white transition-[width] duration-200',
        collapsed ? 'w-16 sm:w-[88px]' : 'w-[220px] sm:w-[260px]',
      )}
    >
      <div
        className={cn(
          'flex pb-8 pt-7',
          collapsed ? 'flex-col items-center gap-3 px-2' : 'items-center gap-3 px-6',
        )}
      >
        <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden="true">
          <path
            d="M14 1.7 25 8v12l-11 6.3L3 20V8z"
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="14" cy="14" r="3.4" fill="var(--color-ink)" />
        </svg>
        {!collapsed && (
          <span className="text-[19px] font-bold tracking-[-0.02em]">
            Claims<span className="ml-1 align-super text-[10px] font-medium text-nav">v1.0</span>
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className={cn(
            'rounded-md p-1 text-nav transition hover:bg-field focus-visible:outline-2 focus-visible:outline-brand',
            !collapsed && 'ml-auto',
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className={cn('flex flex-col gap-1', collapsed ? 'px-2' : 'px-4')}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-field py-3 text-[14px] font-medium transition',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                collapsed ? 'justify-center px-2' : 'px-4',
                active ? 'bg-brand text-white' : 'text-nav hover:bg-field',
              )}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
            >
              <Icon className="size-[18px] shrink-0" />
              {!collapsed && (
                <>
                  <span>{label}</span>
                  <ChevronRight className="ml-auto size-4 opacity-60" />
                </>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto p-4">
        {!collapsed && (
          <div className="mb-4 rounded-2xl bg-[linear-gradient(160deg,var(--color-promo-from),var(--color-promo-to))] p-5 text-center">
            <p className="mb-3 text-[13px] font-semibold leading-snug text-white">
              2,400-page bundle ready for review
            </p>
            <Link
              href="/claims"
              className="inline-block rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-brand"
            >
              Open workspace
            </Link>
          </div>
        )}
        <div className="flex items-center gap-3 px-2">
          <Avatar name={user.name} hue={user.hue} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{user.name}</p>
              <p className="truncate text-[12px] text-nav">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
