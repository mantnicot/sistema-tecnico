import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { CueMode } from '../../types/tava'
import { useTavaStore } from '../../store/tavaStore'
import { TeleprompterPins } from './TeleprompterPins'
import { usePdfUrl } from '../../hooks/usePdfUrl'

type Draft = {
  trackId: string
  trackName: string
  cueName: string
  mode: CueMode
}

export function TechnicalDesk() {
  const obras = useTavaStore((s) => s.obras)
  const scripts = useTavaStore((s) => s.scripts)
  const technicalObraId = useTavaStore((s) => s.technicalObraId)
  const setTechnicalObraId = useTavaStore((s) => s.setTechnicalObraId)
  const linkScriptToObra = useTavaStore((s) => s.linkScriptToObra)
  const addCue = useTavaStore((s) => s.addCue)
  const removeCue = useTavaStore((s) => s.removeCue)
  const removeTrackFromObra = useTavaStore((s) => s.removeTrackFromObra)
  const pendingCueOffset = useTavaStore((s) => s.pendingCueOffset)
  const setPendingCueOffset = useTavaStore((s) => s.setPendingCueOffset)
  const getObra = useTavaStore((s) => s.getObra)
  const getScript = useTavaStore((s) => s.getScript)

  const [view, setView] = useState<'text' | 'pdf'>('text')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [scrollPlaying, setScrollPlaying] = useState(false)
  const [tpScroll, setTpScroll] = useState(0)

  const obra = getObra(technicalObraId)
  const script = getScript(obra?.linkedScriptId ?? null)
  const pdfUrl = usePdfUrl(script?.pdfBlobId)

  useEffect(() => {
    if (!scrollPlaying) return
    const id = window.setInterval(() => setTpScroll((v) => v + 2), 28)
    return () => clearInterval(id)
  }, [scrollPlaying])

  return (
    <motion.section
      className="flow-panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="flow-head">
        <div>
          <h2>Gestión técnica</h2>
          <p className="flow-sub">
            Vincula un guión a la obra y coloca las pistas en el texto: verás la
            posición con la barra superior y la etiqueta «aquí» en el teleprompter.
          </p>
        </div>
      </header>

      <div className="tech-toolbar card">
        <label className="lbl-row">
          Obra
          <select
            className="sel"
            value={technicalObraId ?? ''}
            onChange={(e) => setTechnicalObraId(e.target.value || null)}
          >
            <option value="">— Elegir obra —</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {obra && (
          <label className="lbl-row">
            Guión vinculado
            <select
              className="sel"
              value={obra.linkedScriptId ?? ''}
              onChange={(e) => linkScriptToObra(obra.id, e.target.value || null)}
            >
              <option value="">— Sin guión —</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!obra || !script ? (
        <p className="empty big">
          Elija una obra y asigne un guión para ver el teleprompter y las marcas.
        </p>
      ) : (
        <>
          {script.pdfBlobId && pdfUrl && (
            <div className="view-tabs">
              <button
                type="button"
                className={`tab ${view === 'text' ? 'on' : ''}`}
                onClick={() => setView('text')}
              >
                Teleprompter (texto)
              </button>
              <button
                type="button"
                className={`tab ${view === 'pdf' ? 'on' : ''}`}
                onClick={() => setView('pdf')}
              >
                PDF original
              </button>
            </div>
          )}

          <div className="tech-split">
            <div className="tech-tp card">
              <div className="tech-tp-head">
                <span className="tag">
                  Ancla de colocación: carácter {pendingCueOffset}
                </span>
                <div className="tp-transport">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setScrollPlaying((v) => !v)}
                  >
                    {scrollPlaying ? 'Pausa scroll' : 'Play scroll'}
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => setTpScroll((v) => Math.max(0, v - 120))}
                  >
                    ◀ Retroceder
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    onClick={() => setTpScroll((v) => v + 120)}
                  >
                    Adelantar ▶
                  </button>
                </div>
              </div>
              <div className="help-callout">
                <strong>Cómo colocar música en el guión</strong>
                <ol className="help-steps">
                  <li>
                    Haz clic en la palabra (o letra) donde debe dispararse la
                    pista: verás la etiqueta <em>«aquí»</em> y la barra de posición.
                  </li>
                  <li>
                    Arrastra una pista desde la derecha y <strong>suéltala sobre
                    el texto</strong>: la marca usará el punto exacto bajo el
                    cursor, no solo el número del ancla.
                  </li>
                  <li>
                    Las marcas guardadas muestran <strong>♪</strong> y una equis
                    <strong> ×</strong> junto a cada una: pulsa la equis para
                    quitarla del guión sin borrar el archivo de audio.
                  </li>
                </ol>
              </div>
              <p className="hint hint-tight">
                En vista PDF no se pueden añadir marcas por coordenadas; vuelve a
                «Teleprompter (texto)» para una colocación precisa.
              </p>
              {view === 'pdf' && pdfUrl ? (
                <iframe className="pdf-frame" title="PDF" src={pdfUrl} />
              ) : (
                <TeleprompterPins
                  text={script.text}
                  cues={obra.cues}
                  onPickOffset={setPendingCueOffset}
                  scrollTop={tpScroll}
                  onScroll={setTpScroll}
                  dropAnchorOffset={pendingCueOffset}
                  showDocumentMeta
                  metaVariant="technical"
                  onDropTrack={(trackId, atOffset) => {
                    setPendingCueOffset(atOffset)
                    const tr = obra.tracks.find((t) => t.id === trackId)
                    if (!tr) return
                    setDraft({
                      trackId,
                      trackName: tr.name,
                      cueName: tr.name,
                      mode: 'direct',
                    })
                  }}
                  onRemoveCue={(cueId) => removeCue(obra.id, cueId)}
                />
              )}
            </div>

            <aside className="tech-tracks card">
              <h3>Pistas de la obra</h3>
              <p className="hint">
                Arrastra la pista al guión. La equis a la derecha quita la pista
                de la obra y todas sus marcas en el texto.
              </p>
              <ul className="tech-track-list">
                {obra.tracks.map((t) => (
                  <li key={t.id} className="tech-track-row">
                    <button
                      type="button"
                      className="track-pill"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-tava-track', t.id)
                        e.dataTransfer.setData('text/plain', t.id)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      className="cue-remove-x"
                      title={`Quitar «${t.name}» de la obra (también borra sus marcas en el guión)`}
                      aria-label={`Eliminar pista ${t.name} de la obra`}
                      onClick={() => {
                        void removeTrackFromObra(obra.id, t.id)
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {!obra.tracks.length && (
                  <li className="empty">Sin pistas en esta obra.</li>
                )}
              </ul>
            </aside>
          </div>

          <div className="cue-table card">
            <h3>Marcas musicales guardadas</h3>
            <p className="hint hint-tight">
              Cada fila tiene una equis para eliminar solo esa marca del guión.
            </p>
            <ul>
              {[...obra.cues]
                .sort(
                  (a, b) =>
                    a.charOffset - b.charOffset || a.order - b.order,
                )
                .map((c) => {
                  const tr = obra.tracks.find((t) => t.id === c.trackId)
                  return (
                    <li key={c.id} className="cue-row">
                      <span className="mono">#{c.charOffset}</span>
                      <span className="cue-row-name">{c.cueName}</span>
                      <span className="tag">{c.mode}</span>
                      <span className="muted">{tr?.name ?? '?'}</span>
                      <button
                        type="button"
                        className="cue-remove-x"
                        title="Quitar esta marca del guión (no borra el archivo de audio)"
                        aria-label={`Eliminar marca ${c.cueName}`}
                        onClick={() => removeCue(obra.id, c.id)}
                      >
                        ×
                      </button>
                    </li>
                  )
                })}
              {!obra.cues.length && (
                <li className="empty">Aún no hay marcas en el guión.</li>
              )}
            </ul>
          </div>
        </>
      )}

      {draft && obra && script && (
        <CueDraftModal
          draft={draft}
          offset={pendingCueOffset}
          scriptText={script.text}
          onClose={() => setDraft(null)}
          onSave={() => {
            addCue(obra.id, {
              charOffset: pendingCueOffset,
              trackId: draft.trackId,
              cueName: draft.cueName,
              mode: draft.mode,
            })
            setDraft(null)
          }}
          onChange={setDraft}
        />
      )}
    </motion.section>
  )
}

function CueDraftModal({
  draft,
  offset,
  scriptText,
  onClose,
  onSave,
  onChange,
}: {
  draft: Draft
  offset: number
  scriptText: string
  onClose: () => void
  onSave: () => void
  onChange: (d: Draft) => void
}) {
  const a = Math.max(0, offset - 48)
  const b = Math.min(scriptText.length, offset + 48)
  const left = scriptText.slice(a, offset)
  const right = scriptText.slice(offset, b)

  return (
    <div className="modal-lite">
      <div className="modal-lite-inner">
        <h3>Nueva marca musical</h3>
        <p className="hint">
          Posición en el texto: <strong>{offset}</strong> · Pista:{' '}
          <strong>{draft.trackName}</strong>
        </p>
        <p className="cue-context mono" aria-live="polite">
          <span className="cue-context-label">Contexto en el guión</span>
          <span className="cue-context-text">
            {a > 0 ? '…' : ''}
            {left}
            <span className="cue-context-caret">▍</span>
            {right}
            {b < scriptText.length ? '…' : ''}
          </span>
        </p>
        <label className="lbl-col">
          Nombre visible (ej. Música de cocina)
          <input
            className="inp"
            value={draft.cueName}
            onChange={(e) => onChange({ ...draft, cueName: e.target.value })}
          />
        </label>
        <label className="lbl-col">
          Cómo entra / sale
          <select
            className="sel"
            value={draft.mode}
            onChange={(e) =>
              onChange({ ...draft, mode: e.target.value as CueMode })
            }
          >
            <option value="fade_in">Fade in</option>
            <option value="direct">Directa</option>
            <option value="fade_out">Fade out (cola suave al terminar)</option>
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={onSave}>
            Guardar marca
          </button>
        </div>
      </div>
    </div>
  )
}
