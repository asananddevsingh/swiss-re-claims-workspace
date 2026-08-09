'use client'

import { memo, useEffect, useRef } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPage } from '@/lib/pdf'
import type { Annotation } from '@/lib/contracts-client'

type Props = {
  doc: PDFDocumentProxy | null
  pageNumber: number
  width: number
  height: number
  top: number
  annotations: Annotation[]
  drawing: boolean
  onDraw: (pageIndex: number, rect: { x: number; y: number; w: number; h: number }) => void
  onSelectAnnotation: (id: string) => void
}

/**
 * One page. Memoised on the values that actually change its pixels — scrolling
 * past a page must not re-render the ones still on screen.
 */
function PdfPageInner({
  doc,
  pageNumber,
  width,
  height,
  top,
  annotations,
  drawing,
  onDraw,
  onSelectAnnotation,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!doc || !canvas) return

    const handle = renderPage(doc, pageNumber, canvas, width)
    return () => handle.cancel()
  }, [doc, pageNumber, width])

  function toNormalised(e: React.MouseEvent) {
    const box = surfaceRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - box.left) / box.width,
      y: (e.clientY - box.top) / box.height,
    }
  }

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{ top, width, height }}
      data-page={pageNumber}
    >
      <div className="mb-1.5 text-center text-[11px] font-medium text-muted">
        Page {pageNumber}
      </div>
      <div
        ref={surfaceRef}
        className="relative overflow-hidden rounded-md bg-white shadow-[0_2px_18px_rgba(41,45,50,0.13)]"
        style={{ width, height: height - 22, cursor: drawing ? 'crosshair' : 'default' }}
        onMouseDown={(e) => {
          if (!drawing) return
          dragRef.current = toNormalised(e)
        }}
        onMouseUp={(e) => {
          if (!drawing || !dragRef.current) return
          const start = dragRef.current
          const end = toNormalised(e)
          dragRef.current = null

          const rect = {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            w: Math.abs(end.x - start.x),
            h: Math.abs(end.y - start.y),
          }
          if (rect.w > 0.01 && rect.h > 0.01) onDraw(pageNumber - 1, rect)
        }}
      >
        <canvas ref={canvasRef} className="block" />

        {/*
          Annotations are an overlay in normalised coordinates, not pixels burned
          into the page. They survive zoom, re-render and re-pagination.
        */}
        {annotations.map((a) => (
          <button
            key={a.id}
            onClick={() => onSelectAnnotation(a.id)}
            title={a.body ?? 'Annotation'}
            className="absolute rounded-[3px] border-2 border-brand bg-[rgba(89,50,234,0.14)] transition hover:bg-[rgba(89,50,234,0.24)]"
            style={{
              left: `${a.x * 100}%`,
              top: `${a.y * 100}%`,
              width: `${a.w * 100}%`,
              height: `${a.h * 100}%`,
            }}
          >
            <span className="absolute -top-2 -left-2 flex size-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
              {a.body ? '!' : '•'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export const PdfPage = memo(PdfPageInner, (prev, next) => {
  return (
    prev.doc === next.doc &&
    prev.pageNumber === next.pageNumber &&
    prev.width === next.width &&
    prev.top === next.top &&
    prev.drawing === next.drawing &&
    prev.annotations === next.annotations
  )
})
