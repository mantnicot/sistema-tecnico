import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTavaStore, buildPlaybackGroups } from '../../store/tavaStore'
import { TeleprompterPins } from './TeleprompterPins'
import { usePdfUrl } from '../../hooks/usePdfUrl'

export function OperatorDesk() {
  const obras = useTavaStore((s) => s.obras)
  const operatorObraId = useTavaStore((s) => s.operatorObraId)
  const setOperatorObraId = useTavaStore((s) => s.setOperatorObraId)
  const operatorGroupIndex = useTavaStore((s) => s.operatorGroupIndex)
  const setOperatorGroupIndex = useTavaStore((s) => s.setOperatorGroupIndex)
  const operatorPlaying = useTavaStore((s) => s.operatorPlaying)
  const operatorMasterVol = useTavaStore((s) => s.operatorMasterVol)
  const setOperatorMasterVol = useTavaStore((s) => s.setOperatorMasterVol)
  const operatorPlay = useTavaStore((s) => s.operatorPlay)
  const operatorPause = useTavaStore((s) => s.operatorPause)
  const operatorAdvance = useTavaStore((s) => s.operatorAdvance)
  const operatorRewind = useTavaStore((s) => s.operatorRewind)
  const getObra = useTavaStore((s) => s.getObra)
  const getScript = useTavaStore((s) => s.getScript)

  const [tpScroll, setTpScroll] = useState(0)
  const [view, setView] = useState<'text' | 'pdf'>('text')
  const [queueOpen, setQueueOpen] = useState(false)

  const obra = getObra(operatorObraId)
  const script = getScript(obra?.linkedScriptId ?? null)
  const pdfUrl = usePdfUrl(script?.pdfBlobId)
  const groups = obra ? buildPlaybackGroups(obra.cues) : []
  const current = groups[operatorGroupIndex]
  const next = groups[operatorGroupIndex + 1]

  const nowLabel = current?.cues.map((c) => c.cueName).join(' + ') || '—'
  const nextLabel = next?.cues.map((c) => c.cueName).join(' + ') || '—'

  return (
    <motion.section
      className="flow-panel operator"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="flow-head flow-head--compact">
        <div className="flow-head-desktop">
          <h2>Técnico</h2>
          <p className="flow-sub">
            Cabina en función: el guión muestra dónde va cada marca musical; la lista es el
            orden de disparo.
          </p>
        </div>
        <label className="lbl-row op-obra-pick">
          Obra en función
          <select
            className="sel"
            value={operatorObraId ?? ''}
            onChange={(e) => {
              operatorPause()
              setOperatorObraId(e.target.value || null)
              setTpScroll(0)
            }}
          >
            <option value="">— Elegir —</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {!obra || !script ? (
        <p className="empty big">
          Seleccione una obra con guión vinculado y marcas en “Gestión técnica”.
        </p>
      ) : (
        <div className="op-layout">
          <div className="op-tp card op-tp--hero">
            {script.pdfBlobId && pdfUrl && (
              <div className="view-tabs">
                <button
                  type="button"
                  className={`tab ${view === 'text' ? 'on' : ''}`}
                  onClick={() => setView('text')}
                >
                  Teleprompter
                </button>
                <button
                  type="button"
                  className={`tab ${view === 'pdf' ? 'on' : ''}`}
                  onClick={() => setView('pdf')}
                >
                  PDF
                </button>
              </div>
            )}
            {view === 'pdf' && pdfUrl ? (
              <iframe className="pdf-frame lg" title="PDF" src={pdfUrl} />
            ) : (
              <TeleprompterPins
                text={script.text}
                cues={obra.cues}
                onPickOffset={() => {}}
                scrollTop={tpScroll}
                onScroll={setTpScroll}
                followPlaybackOffset={current?.charOffset ?? null}
                showDocumentMeta
                metaVariant="operator"
                autoFollowPlayback
              />
            )}
          </div>

          <div className={`op-queue card ${queueOpen ? 'op-queue--open' : ''}`}>
            <button
              type="button"
              className="op-queue-toggle"
              onClick={() => setQueueOpen((v) => !v)}
              aria-expanded={queueOpen}
            >
              <span>
                Orden de marcas ({groups.length})
                {current && (
                  <span className="op-queue-now">
                    {' '}
                    · #{operatorGroupIndex + 1} {nowLabel}
                  </span>
                )}
              </span>
              <span className="op-queue-chevron" aria-hidden>
                {queueOpen ? '▾' : '▴'}
              </span>
            </button>
            <div className="op-queue-body">
              <h3 className="op-queue-title">Orden de marcas</h3>
              <p className="hint hint-tight op-queue-hint">
                Toca una fila para seleccionarla; Play reproduce esa marca.
              </p>
              <ol className="op-list">
                {groups.map((g, idx) => (
                  <li key={`${g.charOffset}-${idx}`}>
                    <button
                      type="button"
                      className={`op-li ${idx === operatorGroupIndex ? 'sel' : ''}`}
                      onClick={() => {
                        operatorPause()
                        setOperatorGroupIndex(idx)
                      }}
                    >
                      <span className="mono">#{idx + 1}</span>
                      <span>{g.cues.map((c) => c.cueName).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ol>
              {!groups.length && (
                <p className="empty">Sin marcas musicales en esta obra.</p>
              )}
            </div>
          </div>

          <div className="op-player-dock card">
            <details className="op-help-mobile">
              <summary>Ayuda cabina</summary>
              <ul className="help-bullets">
                <li>
                  <strong>Play</strong> dispara la marca resaltada.
                </li>
                <li>
                  <strong>Pausar</strong> corta el audio sin cambiar la marca.
                </li>
                <li>El teleprompter marca <strong>▶</strong> en el punto del guión.</li>
              </ul>
            </details>

            <div className="help-callout help-callout--compact op-help-desktop">
              <strong>Reproducir música</strong>
              <ul className="help-bullets">
                <li>
                  <strong>Play</strong> dispara la fila resaltada en la lista (todas las pistas de
                  esa marca a la vez).
                </li>
                <li>
                  <strong>Pausar</strong> corta el audio; no cambia la marca seleccionada.
                </li>
                <li>
                  Usa las flechas o la lista para saltar; el teleprompter muestra{' '}
                  <strong>▶</strong> en el punto del guión.
                </li>
              </ul>
            </div>

            <div className="op-dock-now">
              <div className="op-now-row">
                <span className={`live-dot ${operatorPlaying ? 'on' : ''}`} />
                <span className="op-now-label">
                  {operatorPlaying ? 'Sonando' : 'En espera'}
                </span>
                <span className="op-dock-counter mono">
                  {groups.length ? `${operatorGroupIndex + 1}/${groups.length}` : '—'}
                </span>
              </div>
              <div className="op-now-title">{nowLabel}</div>
              <div className="op-next">
                <span className="muted">Siguiente</span> {nextLabel}
              </div>
            </div>

            <label className="lbl-col op-vol">
              <span className="op-vol-label">Volumen</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={operatorMasterVol}
                onChange={(e) => setOperatorMasterVol(Number(e.target.value))}
              />
            </label>

            <div className="op-play-row">
              <button
                type="button"
                className="btn ghost op-nav-btn"
                disabled={!groups.length}
                onClick={() => operatorRewind()}
                aria-label="Marca anterior"
              >
                <span className="op-nav-icon" aria-hidden>
                  ⏮
                </span>
                <span className="op-nav-text">Anterior</span>
              </button>
              <button
                type="button"
                className="btn xl primary op-play-btn"
                disabled={!groups.length}
                onClick={() => {
                  if (operatorPlaying) operatorPause()
                  else void operatorPlay()
                }}
                aria-label={operatorPlaying ? 'Pausar' : 'Reproducir'}
              >
                {operatorPlaying ? '⏸' : '▶'}
              </button>
              <button
                type="button"
                className="btn ghost op-nav-btn"
                disabled={!groups.length}
                onClick={() => operatorAdvance()}
                aria-label="Marca siguiente"
              >
                <span className="op-nav-icon" aria-hidden>
                  ⏭
                </span>
                <span className="op-nav-text">Siguiente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.section>
  )
}
