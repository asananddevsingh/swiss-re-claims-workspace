'use client'

import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// Parsing runs off the main thread. Without this the page rail stutters while
// the thing it is scrolling over is being parsed.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export type LoadedDocument = {
  doc: PDFDocumentProxy
  pageCount: number
}

/**
 * Opens a document over HTTP Range.
 *
 * disableAutoFetch is the option that matters. Left at its default, PDF.js
 * quietly pulls the remaining bytes in the background after the first page
 * resolves — which is fine for a 2 MB invoice and fatal for a 1.5 GB bundle.
 * With it off, the only bytes that move are the ones a visible page needs.
 */
export async function openDocument(url: string): Promise<LoadedDocument> {
  const task = pdfjs.getDocument({
    url,
    disableAutoFetch: true,
    disableStream: false,
    rangeChunkSize: 65536,
    withCredentials: true,
  })

  const doc = await task.promise
  return { doc, pageCount: doc.numPages }
}

export type RenderHandle = { cancel: () => void }

/**
 * Renders one page into a canvas at the given CSS width.
 * Returns a handle so the caller can abort when the page scrolls out of view —
 * without that, fast scrolling queues render work that is already stale.
 */
export function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): RenderHandle {
  let cancelled = false
  let task: { cancel: () => void } | null = null

  void (async () => {
    try {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return

      const base = page.getViewport({ scale: 1 })
      const scale = cssWidth / base.width
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: scale * dpr })

      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`

      const ctx = canvas.getContext('2d')
      if (!ctx || cancelled) return

      const render = page.render({ canvas, canvasContext: ctx, viewport })
      task = render
      await render.promise
    } catch (err) {
      // A cancelled render rejects; that is the expected path on fast scroll.
      const name = (err as { name?: string })?.name
      if (name !== 'RenderingCancelledException' && !cancelled) {
        console.warn(`page ${pageNumber} render failed`, err)
      }
    }
  })()

  return {
    cancel() {
      cancelled = true
      task?.cancel()
    },
  }
}
