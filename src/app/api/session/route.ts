import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { ROLES } from '@/lib/policy'
import { issueSession, getSession } from '@/lib/session'
import { handleError } from '@/lib/api'

const body = z.object({ role: z.enum(ROLES) })

export async function POST(req: NextRequest) {
  try {
    const { role } = body.parse(await req.json())
    await issueSession(role)
    return NextResponse.json({ ok: true, role })
  } catch (err) {
    return handleError(err)
  }
}

export async function GET() {
  const session = await getSession()
  return NextResponse.json({ session })
}
