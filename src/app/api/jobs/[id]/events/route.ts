import { type NextRequest } from 'next/server'
import { requireSession } from '@/lib/session'
import { sql } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TERMINAL = new Set(['done', 'failed', 'cancelled'])

/**
 * Progress as server-sent events.
 *
 * The client gets a push instead of polling, and the stream closes itself on a
 * terminal state so neither side is left holding a connection. Progress is read
 * from the jobs table, so the instance streaming does not have to be the one
 * doing the work.
 */
export async function GET(req: NextRequest, { params }: Params) {
  await requireSession()
  const { id } = await params

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      const stop = () => {
        if (closed) return
        closed = true
        clearInterval(timer)
        try {
          controller.close()
        } catch {
          // already closed by the client disconnecting
        }
      }

      req.signal.addEventListener('abort', stop)

      const tick = async () => {
        try {
          const rows = (await sql.query(
            'select status, progress, total_pages, message from jobs where id = $1',
            [id],
          )) as { status: string; progress: number; total_pages: number; message: string | null }[]

          if (!rows.length) {
            send('error', { error: 'Job not found' })
            stop()
            return
          }

          const job = rows[0]
          send('progress', {
            status: job.status,
            progress: job.progress,
            totalPages: job.total_pages,
            message: job.message,
          })

          if (TERMINAL.has(job.status)) stop()
        } catch {
          stop()
        }
      }

      const timer = setInterval(tick, 500)
      await tick()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
