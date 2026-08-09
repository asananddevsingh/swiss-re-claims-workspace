/**
 * Single source of truth for authorisation.
 *
 * Every request evaluates policy once and gets two things out of it:
 *   - a row scope, folded into the SQL WHERE clause
 *   - a capability set, sent to the client so it can disable what would fail
 *
 * The capability set is a courtesy for the UI. The row scope and the action
 * checks below are the actual boundary — see requireCapability().
 */

export const ROLES = ['adjudicator', 'supervisor', 'auditor', 'admin'] as const
export type Role = (typeof ROLES)[number]

export type Capability =
  | 'claims.edit'
  | 'claims.delete'
  | 'claims.assign'
  | 'documents.annotate'
  | 'documents.split'
  | 'documents.merge'

const GRANTS: Record<Role, Capability[]> = {
  adjudicator: ['claims.edit', 'documents.annotate'],
  supervisor: [
    'claims.edit',
    'claims.assign',
    'documents.annotate',
    'documents.split',
    'documents.merge',
  ],
  auditor: [],
  admin: [
    'claims.edit',
    'claims.delete',
    'claims.assign',
    'documents.annotate',
    'documents.split',
    'documents.merge',
  ],
}

export type Session = {
  userId: string
  name: string
  role: Role
  teamId: string
}

export function capabilitiesFor(role: Role): Capability[] {
  return GRANTS[role]
}

export function can(session: Session, cap: Capability): boolean {
  return GRANTS[session.role].includes(cap)
}

/** Row visibility. Returned as a fragment the query builder folds in. */
export type RowScope =
  | { kind: 'all' }
  | { kind: 'team'; teamId: string }
  | { kind: 'assigned'; userId: string }

export function rowScopeFor(session: Session): RowScope {
  switch (session.role) {
    case 'admin':
    case 'auditor':
      return { kind: 'all' }
    case 'supervisor':
      return { kind: 'team', teamId: session.teamId }
    case 'adjudicator':
      return { kind: 'assigned', userId: session.userId }
  }
}

export class ForbiddenError extends Error {
  constructor(public capability: Capability) {
    super(`Missing capability: ${capability}`)
    this.name = 'ForbiddenError'
  }
}

/** Throws unless the session holds the capability. Call this in every mutating route. */
export function requireCapability(session: Session, cap: Capability): void {
  if (!can(session, cap)) throw new ForbiddenError(cap)
}

export const ROLE_LABELS: Record<Role, string> = {
  adjudicator: 'Adjudicator',
  supervisor: 'Team Supervisor',
  auditor: 'Auditor',
  admin: 'Administrator',
}

export const ROLE_SCOPE_HINT: Record<Role, string> = {
  adjudicator: 'Sees only claims assigned to them',
  supervisor: 'Sees their team’s claims',
  auditor: 'Sees everything, read-only',
  admin: 'Full access',
}
