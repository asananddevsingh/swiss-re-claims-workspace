import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'

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
  if (!path) return null
  const s = await stat(path)
  return { size: s.size }
}

export async function readRange(
  key: string,
  start: number,
  end: number,
): Promise<ReadableStream<Uint8Array> | null> {
  const path = await resolve(key)
  if (!path) return null
  const node = createReadStream(path, { start, end })
  return Readable.toWeb(node) as ReadableStream<Uint8Array>
}

export async function readWhole(key: string) {
  const path = await resolve(key)
  if (!path) return null
  const { readFile } = await import('node:fs/promises')
  return readFile(path)
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
