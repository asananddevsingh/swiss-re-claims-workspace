'use client'

import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * PDF.js is loaded on first use rather than at module scope.
 *
 * A client component is still rendered on the server to produce initial HTML,
 * and importing pdfjs-dist there evaluates browser-only globals — `DOMMatrix`
 * is the one that throws. Deferring the import to the point of use keeps the
 * module off the server entirely.
 *
 * The promise is cached, so the worker is configured exactly once no matter how
 * many documents are opened.
 */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      // Parsing runs off the main thread. Without this the page rail stutters
      // while the thing it is scrolling over is being parsed.
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      return mod
    })
  }
  return pdfjsPromise
}

export type LoadedDocument = {
  doc: PDFDocumentProxy
  pageCount: number
}

/**
 * Opens a document over HTTP Range.
 *
 * Two options decide whether the file is streamed whole or read in pieces, and
 * only both together give range-only behaviour. Setting just disableAutoFetch
 * leaves the progressive full-file read in place, so the whole object arrives
 * anyway and the range requests that follow are served from cache — which looks
 * like streaming in the network panel while being the opposite of it.
 */
export async function openDocument(url: string): Promise<LoadedDocument> {
  const pdfjs = await loadPdfjs()

  const task = pdfjs.getDocument({
    url,
    // Both flags are required, and they do different jobs. disableAutoFetch
    // stops the background prefetch of remaining chunks; disableStream stops
    // the full-file progressive read. With streaming left on, PDF.js opens one
    // GET for the whole object and reads it through — which downloaded the
    // entire document while the range requests that followed merely hit cache.
    disableAutoFetch: true,
    disableStream: true,
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
