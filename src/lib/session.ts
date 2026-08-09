import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { ROLES, type Role, type Session } from './policy'

const COOKIE = 'cw_session'
const ALG = 'HS256'

function secret() {
  const raw = process.env.SESSION_SECRET
  if (!raw) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(raw)
}

/**
 * Demo identities. In production these come from the IdP; the shape of what
 * lands in the session — id, role, team — is what matters here.
 */
export const DEMO_USERS: Record<Role, Session & { avatarHue: number }> = {
  adjudicator: {
    userId: 'u-anna',
    name: 'Anna Weber',
    role: 'adjudicator',
    teamId: 'team-zrh',
    avatarHue: 258,
  },
  supervisor: {
    userId: 'u-marco',
    name: 'Marco Rossi',
    role: 'supervisor',
    teamId: 'team-zrh',
    avatarHue: 160,
  },
  auditor: {
    userId: 'u-priya',
    name: 'Priya Nair',
    role: 'auditor',
    teamId: 'team-blr',
    avatarHue: 28,
  },
  admin: {
    userId: 'u-dana',
    name: 'Dana Fischer',
    role: 'admin',
    teamId: 'team-zrh',
    avatarHue: 340,
  },
}

export async function issueSession(role: Role) {
  const user = DEMO_USERS[role]
  const token = await new SignJWT({
    name: user.name,
    role: user.role,
    teamId: user.teamId,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret())

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
}

/**
 * Reads and verifies the session. Returns null rather than throwing so callers
 * decide between redirecting (pages) and 401ing (API routes).
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] })
    const role = payload.role as Role
    if (!ROLES.includes(role)) return null

    return {
      userId: payload.sub as string,
      name: payload.name as string,
      role,
      teamId: payload.teamId as string,
    }
  } catch {
    return null
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new UnauthorizedError()
  return session
}

export class UnauthorizedError extends Error {
  constructor() {
    super('No valid session')
    this.name = 'UnauthorizedError'
  }
}
