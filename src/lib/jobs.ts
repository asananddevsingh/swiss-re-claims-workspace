import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { sql } from './db'
import { readWhole, WRITE_ROOT } from './storage'

export type JobKind = 'split' | 'merge' | 'delete_pages'

async function setProgress(jobId: string, progress: number) {
  await sql.query(
    'update jobs set progress = $1, updated_at = now() where id = $2 and status = $3',
    [progress, jobId, 'running'],
  )
}

async function isCancelled(jobId: string) {
  const rows = (await sql.query('select status from jobs where id = $1', [jobId])) as {
    status: string
  }[]
  return rows[0]?.status === 'cancelled'
}

async function finish(jobId: string, status: string, message: string) {
  await sql.query(
    'update jobs set status = $1, message = $2, updated_at = now() where id = $3',
    [status, message, jobId],
  )
}

/**
 * Runs a page operation.
 *
 * Copy-on-write: output goes to a new object and a new catalogue row, and the
 * source is never mutated. A job that dies halfway leaves the original exactly
 * as it was, which is what makes cancel and retry safe.
 *
 * Progress is written to the jobs table rather than held in memory so the SSE
 * stream can be served by a different instance than the one doing the work.
 */
export async function runPageOperation(
  jobId: string,
  documentId: string,
  kind: JobKind,
  pages: number[],
) {
  try {
    await sql.query(
      'update jobs set status = $1, updated_at = now() where id = $2',
      ['running', jobId],
    )

    const rows = (await sql.query(
      'select storage_key, filename, page_count, version from documents where id = $1',
      [documentId],
    )) as { storage_key: string; filename: string; page_count: number; version: number }[]

    if (!rows.length) {
      await finish(jobId, 'failed', 'Source document not found')
      return
    }

    const source = rows[0]
    const bytes = await readWhole(source.storage_key)
    if (!bytes) {
      await finish(jobId, 'failed', 'Source object missing from storage')
      return
    }

    const src = await PDFDocument.load(bytes, { updateMetadata: false })

    const keep =
      kind === 'delete_pages'
        ? src.getPageIndices().filter((i) => !pages.includes(i))
        : pages.filter((i) => i < src.getPageCount())

    if (!keep.length) {
      await finish(jobId, 'failed', 'Operation would leave no pages')
      return
    }

    const out = await PDFDocument.create()

    // Copy in batches so progress moves and cancellation is observed promptly.
    const BATCH = 40
    for (let i = 0; i < keep.length; i += BATCH) {
      if (await isCancelled(jobId)) {
        await finish(jobId, 'cancelled', 'Cancelled before commit — source untouched')
        return
      }

      const slice = keep.slice(i, i + BATCH)
      const copied = await out.copyPages(src, slice)
      copied.forEach((p) => out.addPage(p))

      await setProgress(jobId, Math.round(((i + slice.length) / keep.length) * 100))
    }

    if (await isCancelled(jobId)) {
      await finish(jobId, 'cancelled', 'Cancelled before commit — source untouched')
      return
    }

    const newId = `${documentId}-v${source.version + 1}-${Date.now().toString(36)}`
    const key = `documents/${newId}.pdf`
    const saved = await out.save({ useObjectStreams: false })

    const target = join(WRITE_ROOT, key)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, saved)

    // The pointer swap. Until this row exists, nothing has changed for readers.
    await sql.query(
      `insert into documents (id, filename, byte_size, page_count, version, storage_key)
       values ($1,$2,$3,$4,$5,$6)`,
      [
        newId,
        `${source.filename.replace(/\.pdf$/, '')}-${kind}.pdf`,
        saved.length,
        keep.length,
        source.version + 1,
        key,
      ],
    )

    await sql.query(
      'update jobs set status = $1, progress = 100, message = $2, updated_at = now() where id = $3',
      ['done', `Created ${newId} with ${keep.length} pages`, jobId],
    )
  } catch (err) {
    console.error('job failed', err)
    await finish(jobId, 'failed', err instanceof Error ? err.message : 'Unknown error')
  }
}
