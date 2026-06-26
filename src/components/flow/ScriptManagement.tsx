import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTavaStore } from '../../store/tavaStore'
import { usePdfHref } from '../../hooks/usePdfUrl'

function PdfOpenLink({ pdfBlobId }: { pdfBlobId: string }) {
  const href = usePdfHref(pdfBlobId)
  if (!href) {
    return (
      <span className="btn ghost sm disabled" aria-disabled>
        Cargando PDF…
      </span>
    )
  }
  return (
    <a className="btn ghost sm" href={href} target="_blank" rel="noreferrer">
      Abrir PDF
    </a>
  )
}

export function ScriptManagement() {
  const scripts = useTavaStore((s) => s.scripts)
  const addScriptText = useTavaStore((s) => s.addScriptText)
  const addScriptPdf = useTavaStore((s) => s.addScriptPdf)
  const replaceScriptPdf = useTavaStore((s) => s.replaceScriptPdf)
  const replaceScriptText = useTavaStore((s) => s.replaceScriptText)
  const renameScript = useTavaStore((s) => s.renameScript)
  const removeScript = useTavaStore((s) => s.removeScript)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pdfNewTitle, setPdfNewTitle] = useState('')
  const pdfNewRef = useRef<HTMLInputElement>(null)
  const pdfRepRef = useRef<HTMLInputElement>(null)
  const [repId, setRepId] = useState<string | null>(null)

  return (
    <motion.section
      className="flow-panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="flow-head">
        <div>
          <h2>Gestión de guiones</h2>
          <p className="flow-sub">
            Títulos claros, PDFs que cooperen y un guiñito cómico si el PDF viene
            escaneado a mano… 📜
          </p>
        </div>
      </header>

      <div className="script-create card">
        <h3>Nuevo guión (texto)</h3>
        <input
          className="inp"
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="ta"
          placeholder="Pegue aquí el guión o escriba acto y escena…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
        />
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (!title.trim() && !body.trim()) return
            addScriptText(title.trim() || 'Sin título', body)
            setTitle('')
            setBody('')
          }}
        >
          Guardar guión en texto
        </button>
      </div>

      <div className="script-create card">
        <h3>Nuevo guión (PDF → teleprompter)</h3>
        <p className="hint">
          Se lee el PDF en local y se extrae texto para el teleprompter. También
          podrá ver el PDF original en cabina técnica.
        </p>
        <input
          className="inp"
          placeholder="Título del guión"
          value={pdfNewTitle}
          onChange={(e) => setPdfNewTitle(e.target.value)}
        />
        <input
          ref={pdfNewRef}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const tit =
              pdfNewTitle.trim() || f.name.replace(/\.pdf$/i, '')
            await addScriptPdf(tit, f)
            setPdfNewTitle('')
          }}
        />
        <button
          type="button"
          className="btn secondary"
          onClick={() => pdfNewRef.current?.click()}
        >
          Subir PDF
        </button>
      </div>

      <input
        ref={pdfRepRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          const id = repId
          e.target.value = ''
          setRepId(null)
          if (!f || !id) return
          await replaceScriptPdf(id, f)
        }}
      />

      <div className="script-grid card">
        <h3>Guiones guardados</h3>
        <ul className="script-list">
          {scripts.map((s) => (
            <li key={s.id} className="script-row">
              <div className="script-row-main">
                <input
                  className="inp flat"
                  value={s.title}
                  onChange={(e) => renameScript(s.id, e.target.value)}
                />
                <span className="tag">{s.pdfBlobId ? 'PDF' : 'Texto'}</span>
              </div>
              <textarea
                className="ta sm"
                rows={s.pdfBlobId ? 4 : 8}
                value={s.text}
                onChange={(e) =>
                  replaceScriptText(s.id, s.title, e.target.value)
                }
                title="Texto del teleprompter (editable; PDF se extrajo a texto)"
              />
              <div className="script-row-actions">
                {s.pdfBlobId && <PdfOpenLink pdfBlobId={s.pdfBlobId} />}
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => {
                    setRepId(s.id)
                    pdfRepRef.current?.click()
                  }}
                >
                  Reemplazar PDF
                </button>
                <button
                  type="button"
                  className="btn danger sm"
                  onClick={() => {
                    if (confirm(`¿Eliminar “${s.title}”?`)) void removeScript(s.id)
                  }}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
          {!scripts.length && <li className="empty">Nada por aquí. Cree el primero.</li>}
        </ul>
      </div>
    </motion.section>
  )
}
