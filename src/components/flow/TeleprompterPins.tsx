import { useEffect, useRef, type ReactNode } from 'react'
import type { MusicCue } from '../../types/tava'

type Props = {
  text: string
  cues: MusicCue[]
  onPickOffset: (offset: number) => void
  scrollTop: number
  onScroll: (top: number) => void
  /** Dónde quedará la próxima marca al soltar o al hacer clic (modo técnico). */
  dropAnchorOffset?: number | null
  /** Marca de la lista que está seleccionada / a punto de sonar (modo cabina). */
  followPlaybackOffset?: number | null
  /** Soltar pista en las coordenadas del cursor dentro del guión. */
  onDropTrack?: (trackId: string, charOffset: number) => void
  /** Barra y datos de posición en el documento. */
  showDocumentMeta?: boolean
  metaVariant?: 'technical' | 'operator'
  /** Si se define, cada marca muestra una equis para quitarla del guión (solo gestión técnica). */
  onRemoveCue?: (cueId: string) => void
  /** En cabina: centra la marca activa al cambiar de reproducción. */
  autoFollowPlayback?: boolean
}

function clusterAt(offset: number, cues: MusicCue[]) {
  return cues
    .filter((c) => c.charOffset === offset)
    .sort((a, b) => a.order - b.order)
}

function charOffsetFromClientPoint(
  text: string,
  clientX: number,
  clientY: number,
): number {
  const range =
    document.caretRangeFromPoint?.(clientX, clientY) ??
    (() => {
      const anyDoc = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => {
          offsetNode: Node
          offset: number
        } | null
      }
      const pos = anyDoc.caretPositionFromPoint?.(clientX, clientY)
      if (!pos) return null
      const r = document.createRange()
      r.setStart(pos.offsetNode, pos.offset)
      r.collapse(true)
      return r
    })()
  if (!range) return 0

  let node: Node | null = range.startContainer
  for (let i = 0; i < 24 && node; i++) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.classList.contains('tp-chunk')) {
        const base = Number(el.dataset.base ?? 0)
        const pre = document.createRange()
        pre.selectNodeContents(el)
        pre.setEnd(range.startContainer, range.startOffset)
        return Math.min(text.length, base + pre.toString().length)
      }
      if (el.classList.contains('tp-pin-wrap')) {
        return Math.min(text.length, Number(el.dataset.offset ?? 0))
      }
      if (el.classList.contains('tp-drop-anchor')) {
        return Math.min(text.length, Number(el.dataset.offset ?? 0))
      }
      if (el.classList.contains('tp-marker-cluster')) {
        return Math.min(text.length, Number(el.dataset.offset ?? 0))
      }
    }
    node = node.parentNode
  }
  return 0
}

/** Guion con marcas musicales y ancla de colocación visible */
export function TeleprompterPins({
  text,
  cues,
  onPickOffset,
  scrollTop,
  onScroll,
  dropAnchorOffset = null,
  followPlaybackOffset = null,
  onDropTrack,
  showDocumentMeta = false,
  metaVariant = 'technical',
  onRemoveCue,
  autoFollowPlayback = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (Math.abs(el.scrollTop - scrollTop) > 2) el.scrollTop = scrollTop
  }, [scrollTop])

  useEffect(() => {
    if (!autoFollowPlayback || followPlaybackOffset == null) return
    const root = scrollRef.current
    if (!root) return
    const marker = root.querySelector<HTMLElement>(
      `[data-offset="${followPlaybackOffset}"]`,
    )
    if (!marker) return
    marker.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [autoFollowPlayback, followPlaybackOffset])

  const cueOffsets = [...new Set(cues.map((c) => c.charOffset))]
  const extras: number[] = []
  if (dropAnchorOffset != null) extras.push(dropAnchorOffset)
  if (followPlaybackOffset != null) extras.push(followPlaybackOffset)
  const breakPoints = [...new Set([...cueOffsets, ...extras])].sort(
    (a, b) => a - b,
  )

  const parts: ReactNode[] = []
  let last = 0
  let k = 0

  const clickChunk =
    (base: number) => (e: React.MouseEvent<HTMLSpanElement>) => {
      const el = e.currentTarget
      const range =
        document.caretRangeFromPoint?.(e.clientX, e.clientY) ??
        (() => {
          const anyDoc = document as Document & {
            caretPositionFromPoint?: (x: number, y: number) => {
              offsetNode: Node
              offset: number
            } | null
          }
          const pos = anyDoc.caretPositionFromPoint?.(e.clientX, e.clientY)
          if (!pos) return null
          const r = document.createRange()
          r.setStart(pos.offsetNode, pos.offset)
          r.collapse(true)
          return r
        })()
      if (!range || !el.contains(range.startContainer)) {
        onPickOffset(base)
        return
      }
      const pre = document.createRange()
      pre.selectNodeContents(el)
      pre.setEnd(range.startContainer, range.startOffset)
      const local = pre.toString().length
      onPickOffset(Math.min(text.length, base + local))
    }

  for (const off of breakPoints) {
    if (off > last) {
      const slice = text.slice(last, off)
      parts.push(
        <span
          key={`t-${k++}`}
          className="tp-chunk"
          data-base={last}
          onClick={clickChunk(last)}
        >
          {slice}
        </span>,
      )
    }
    const group = clusterAt(off, cues)
    const showFollow = followPlaybackOffset === off

    parts.push(
      <span
        key={`m-${off}-${k++}`}
        className={`tp-marker-cluster ${showFollow ? 'tp-marker-cluster--follow' : ''}`}
        data-offset={off}
      >
        {showFollow && (
          <span
            className="tp-follow-flag"
            title="Marca actual en la lista de reproducción"
          >
            ▶
          </span>
        )}
        {group.length > 0 ? (
          <span
            className="tp-pin-wrap"
            data-offset={off}
            onClick={(e) => {
              e.stopPropagation()
              onPickOffset(off)
            }}
            title="Marcas musicales en este punto del guión"
          >
            {group.map((c) => (
              <span key={c.id} className="tp-pin" title={c.cueName}>
                {onRemoveCue ? (
                  <button
                    type="button"
                    className="tp-pin-remove"
                    title={`Quitar del guión: ${c.cueName}`}
                    aria-label={`Eliminar marca ${c.cueName}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveCue(c.id)
                    }}
                  >
                    ×
                  </button>
                ) : null}
                <span className="tp-pin-glyph" aria-hidden>
                  ♪
                </span>
                <small>{c.cueName}</small>
              </span>
            ))}
          </span>
        ) : null}
        {group.length === 0 && dropAnchorOffset === off ? (
          <button
            type="button"
            className="tp-drop-anchor"
            data-offset={off}
            title="Aquí quedará la próxima marca musical (clic para mover el ancla)"
            onClick={(e) => {
              e.stopPropagation()
              onPickOffset(off)
            }}
          >
            <span className="tp-drop-anchor-bar" aria-hidden />
            <span className="tp-drop-anchor-label">aquí</span>
          </button>
        ) : null}
        {group.length > 0 && dropAnchorOffset === off ? (
          <button
            type="button"
            className="tp-drop-anchor tp-drop-anchor--inline"
            data-offset={off}
            title="El ancla de colocación coincide con esta marca"
            onClick={(e) => {
              e.stopPropagation()
              onPickOffset(off)
            }}
          >
            <span className="tp-drop-anchor-bar" aria-hidden />
          </button>
        ) : null}
      </span>,
    )
    last = off
  }

  if (last < text.length) {
    parts.push(
      <span
        key={`t-end-${last}`}
        className="tp-chunk"
        data-base={last}
        onClick={clickChunk(last)}
      >
        {text.slice(last)}
      </span>,
    )
  }

  const body =
    parts.length > 0 ? (
      parts
    ) : (
      <span className="tp-chunk" data-base={0} onClick={clickChunk(0)}>
        {text}
      </span>
    )

  const metaOffset =
    metaVariant === 'operator'
      ? (followPlaybackOffset ?? dropAnchorOffset ?? 0)
      : (dropAnchorOffset ?? followPlaybackOffset ?? 0)
  const lineNo = text.length ? text.slice(0, metaOffset).split('\n').length : 1
  const pct = text.length ? Math.min(100, (metaOffset / text.length) * 100) : 0

  return (
    <>
      {showDocumentMeta && text.length > 0 && (
        <div
          className={`tp-doc-meta tp-doc-meta--${metaVariant}`}
          role="status"
          aria-live="polite"
        >
          <div className="tp-doc-meta-row">
            <span className="tp-doc-meta-label">
              {metaVariant === 'operator'
                ? 'Seguimiento en el guión'
                : 'Posición en el documento'}
            </span>
            <span className="tp-doc-meta-values mono">
              car. {metaOffset} / {text.length} · línea ~{lineNo} ·{' '}
              {pct.toFixed(0)}%
            </span>
          </div>
          <div
            className="tp-doc-meta-bar"
            aria-hidden
            title="Recorrido aproximado dentro del texto"
          >
            <div className="tp-doc-meta-fill" style={{ width: `${pct}%` }} />
            <div
              className="tp-doc-meta-thumb"
              style={{ left: `clamp(0px, ${pct}%, calc(100% - 8px))` }}
            />
          </div>
          <p className="tp-doc-meta-hint">
            {metaVariant === 'operator'
              ? 'El indicador ▶ marca el punto del guión asociado a la fila resaltada en la lista. Play reproduce esa marca con el volumen de cabina.'
              : 'Haz clic en una palabra para mover el ancla; suelta la pista encima del texto para fijarla en ese punto exacto. La barra roja muestra el avance dentro del guión.'}
          </p>
        </div>
      )}
      <div
        ref={scrollRef}
        className={`tp-scroll ${onDropTrack ? 'tp-scroll--droppable' : ''}`}
        onScroll={(e) => onScroll((e.target as HTMLDivElement).scrollTop)}
        onDragOver={
          onDropTrack
            ? (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }
            : undefined
        }
        onDrop={
          onDropTrack
            ? (e) => {
                e.preventDefault()
                const trackId =
                  e.dataTransfer.getData('application/x-tava-track') ||
                  e.dataTransfer.getData('text/plain')
                if (!trackId) return
                const at = charOffsetFromClientPoint(
                  text,
                  e.clientX,
                  e.clientY,
                )
                onDropTrack(trackId, at)
              }
            : undefined
        }
      >
        <div className="tp-body">{body}</div>
      </div>
    </>
  )
}
