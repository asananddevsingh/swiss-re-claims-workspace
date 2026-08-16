import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { sql } from './db'

/**
 * Document byte storage.
 *
 * The demo reads from the local filesystem; production reads from object
 * storage. The only thing the rest of the app depends on is the shape below —
 * a size and a stream over an arbitrary byte range — which S3, R2 and GCS all
 * provide natively. Swapping the implementation does not change a caller.
 */

/**
 * Seeded fixtures ship with the deployment and are read-only. Anything a job
 * produces goes to a writable root, which on a serverless host is the only
 * writable path there is. Reads check the writable root first so a freshly
 * created version wins over a bundled one of the same key.
 */
export const READ_ROOT = join(process.cwd(), 'storage')
export const WRITE_ROOT = process.env.VERCEL ? '/tmp/storage' : READ_ROOT

export type ObjectInfo = { size: number }

/**
 * Second backend, for objects with no file behind them.
 *
 * Seeded fixtures travel with the deployment and are read from disk. Job output
 * has nowhere durable to go on a serverless host — the writable path is
 * per-instance — so it is stored in the catalogue row and read back from there.
 * Ranges are sliced in the database rather than loading the whole object, which
 * keeps the read path the same shape as the filesystem one.
 *
 * Production would point both backends at object storage. This module is the
 * only place that knows the difference.
 */
async function dbStat(key: string): Promise<ObjectInfo | null> {
  const rows = (await sql.query(
    `select octet_length(bytes) as size from documents
     where storage_key = $1 and bytes is not null limit 1`,
    [key],
  )) as { size: number | null }[]

  const size = rows[0]?.size
  return size ? { size } : null
}

async function dbRange(key: string, start: number, end: number): Promise<Buffer | null> {
  // Postgres substring is 1-indexed.
  const rows = (await sql.query(
    `select encode(substring(bytes from $2 for $3), 'base64') as chunk
     from documents where storage_key = $1 and bytes is not null limit 1`,
    [key, start + 1, end - start + 1],
  )) as { chunk: string | null }[]

  const chunk = rows[0]?.chunk
  return chunk ? Buffer.from(chunk, 'base64') : null
}

async function resolve(key: string): Promise<string | null> {
  for (const root of WRITE_ROOT === READ_ROOT ? [READ_ROOT] : [WRITE_ROOT, READ_ROOT]) {
    try {
      await stat(join(root, key))
      return join(root, key)
    } catch {
      // try the next root
    }
  }
  return null
}

export async function statObject(key: string): Promise<ObjectInfo | null> {
  const path = await resolve(key)
  if (path) {
    const s = await stat(path)
    return { size: s.size }
  }
  return dbStat(key)
}

export async function readRange(
  key: string,
  start: number,
  end: number,
): Promise<ReadableStream<Uint8Array> | null> {
  const path = await resolve(key)
  if (path) {
    const node = createReadStream(path, { start, end })
    return Readable.toWeb(node) as ReadableStream<Uint8Array>
  }

  const chunk = await dbRange(key, start, end)
  if (!chunk) return null

  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(chunk))
      controller.close()
    },
  })
}

export async function readWhole(key: string) {
  const path = await resolve(key)
  if (path) {
    const { readFile } = await import('node:fs/promises')
    return readFile(path)
  }

  const info = await dbStat(key)
  if (!info) return null
  return dbRange(key, 0, info.size - 1)
}

/**
 * Parses an HTTP Range header. Only the single-range form is supported, which
 * is all PDF.js issues.
 */
export function parseRange(header: string | null, size: number) {
  if (!header) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null

  const [, rawStart, rawEnd] = match

  let start: number
  let end: number

  if (rawStart === '') {
    // Suffix form: last N bytes. PDF.js uses this to find the xref table.
    const suffix = Number(rawEnd)
    if (!suffix) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null

  return { start, end }
}
