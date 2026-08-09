import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { ForbiddenError } from './policy'
import { UnauthorizedError } from './session'

/**
 * Maps thrown errors onto status codes so route handlers stay linear.
 * ForbiddenError -> 403 is what makes the hidden-button demo work: the client
 * check is cosmetic, this is the one that decides.
 */
export function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json(
      { error: 'Your role does not permit this action', capability: err.capability },
      { status: 403 },
    )
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'Invalid request', issues: err.issues.map((i) => i.message) },
      { status: 422 },
    )
  }
  console.error(err)
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
}
