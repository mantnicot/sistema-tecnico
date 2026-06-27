import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTavaStore, buildPlaybackGroups } from '../../store/tavaStore'
import { TeleprompterPins } from './TeleprompterPins'
import { usePdfUrl } from '../../hooks/usePdfUrl'

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  )
}

function IconPrev() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  )
}

function IconNext() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M16 18h2V6h-2zm-11-6 8.5-6v12z" />
    </svg>
  )
}

function IconFadeOut() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 18h2V8H4v10zm4 0h2V11H8v7zm4 0h2V14h-2v4zm4 0h2V6h-2v12z" />
    </svg>
  )
}

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
  const operatorFadeOut = useTavaStore((s) => s.operatorFadeOut)
  const prefetchOperatorCue = useTavaStore((s) => s.prefetchOperatorCue)
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

  useEffect(() => {
    if (!operatorObraId) return
    void prefetchOperatorCue()
  }, [operatorObraId, operatorGroupIndex, prefetchOperatorCue])

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
                <span className="op-nav-icon">
                  <IconPrev />
                </span>
                <span className="op-nav-text">Anterior</span>
              </button>
              <button
                type="button"
                className={`btn primary op-play-btn ${operatorPlaying ? 'is-playing' : ''}`}
                disabled={!groups.length}
                onClick={() => {
                  if (operatorPlaying) operatorPause()
                  else void operatorPlay()
                }}
                aria-label={operatorPlaying ? 'Pausar' : 'Reproducir'}
              >
                {operatorPlaying ? <IconPause /> : <IconPlay />}
              </button>
              <button
                type="button"
                className="btn ghost op-nav-btn"
                disabled={!groups.length}
                onClick={() => operatorAdvance()}
                aria-label="Marca siguiente"
              >
                <span className="op-nav-icon">
                  <IconNext />
                </span>
                <span className="op-nav-text">Siguiente</span>
              </button>
            </div>
            <button
              type="button"
              className="btn secondary op-fade-btn"
              disabled={!operatorPlaying}
              onClick={() => void operatorFadeOut()}
            >
              <IconFadeOut />
              <span>Fade out ahora</span>
            </button>
          </div>
        </div>
      )}
    </motion.section>
  )
}
