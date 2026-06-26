import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTavaStore } from '../../store/tavaStore'

export function SoundManagement() {
  const obras = useTavaStore((s) => s.obras)
  const addObra = useTavaStore((s) => s.addObra)
  const renameObra = useTavaStore((s) => s.renameObra)
  const removeObra = useTavaStore((s) => s.removeObra)
  const addTrackToObra = useTavaStore((s) => s.addTrackToObra)
  const renameTrack = useTavaStore((s) => s.renameTrack)
  const removeTrackFromObra = useTavaStore((s) => s.removeTrackFromObra)
  const reorderTrack = useTavaStore((s) => s.reorderTrack)

  const [newObra, setNewObra] = useState('')
  const [dragFrom, setDragFrom] = useState<{ obraId: string; idx: number } | null>(
    null,
  )
  const [pending, setPending] = useState<{
    obraId: string
    file: File
    name: string
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingObraRef = useRef<string | null>(null)

  return (
    <motion.section
      className="flow-panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="flow-head">
        <div>
          <h2>Gestión de sonidos</h2>
          <p className="flow-sub">
            Cada obra es una lista propia. Nombra pistas, ordénalas y mantén el caos
            lejos del foso… o no. 🎭
          </p>
        </div>
        <div className="flow-head-row">
          <input
            className="inp"
            placeholder="Nombre de la nueva obra"
            value={newObra}
            onChange={(e) => setNewObra(e.target.value)}
          />
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              if (!newObra.trim()) return
              addObra(newObra.trim())
              setNewObra('')
            }}
          >
            Crear obra
          </button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".mp3,.wav,.ogg,.m4a,audio/*"
        onChange={(e) => {
          const f = e.target.files?.[0]
          const oid = pendingObraRef.current
          e.target.value = ''
          pendingObraRef.current = null
          if (!f || !oid) return
          setPending({
            obraId: oid,
            file: f,
            name: f.name.replace(/\.[^.]+$/, ''),
          })
        }}
      />

      {pending && (
        <div className="modal-lite">
          <div className="modal-lite-inner">
            <h3>Nombre en escena</h3>
            <p className="hint">Así verá la pista en cabina (no es magia, es etiqueta).</p>
            <input
              className="inp"
              value={pending.name}
              onChange={(e) =>
                setPending((p) => (p ? { ...p, name: e.target.value } : p))
              }
            />
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setPending(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  void addTrackToObra(pending.obraId, pending.file, pending.name)
                  setPending(null)
                }}
              >
                Guardar pista
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="obra-stack">
        {obras.map((o) => (
          <article key={o.id} className="obra-card">
            <div className="obra-card-head">
              <input
                className="inp obra-title"
                value={o.name}
                onChange={(e) => renameObra(o.id, e.target.value)}
              />
              <div className="obra-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    pendingObraRef.current = o.id
                    fileRef.current?.click()
                  }}
                >
                  + Pista
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    if (confirm(`¿Borrar obra “${o.name}” y todas sus pistas?`))
                      void removeObra(o.id)
                  }}
                >
                  Eliminar obra
                </button>
              </div>
            </div>
            <p className="hint">
              Arrastra filas para ordenar. El orden es el de la función en cabina.
            </p>
            <ul className="track-list">
              {o.tracks.map((t, idx) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={() => setDragFrom({ obraId: o.id, idx })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragFrom && dragFrom.obraId === o.id && dragFrom.idx !== idx) {
                      reorderTrack(o.id, dragFrom.idx, idx)
                    }
                    setDragFrom(null)
                  }}
                >
                  <span className="drag-h">⠿</span>
                  <span className="idx">{idx + 1}</span>
                  <input
                    className="inp flat"
                    value={t.name}
                    onChange={(e) => renameTrack(o.id, t.id, e.target.value)}
                  />
                  <span className="dur">
                    {Math.round(t.durationSec)}s
                  </span>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => void removeTrackFromObra(o.id, t.id)}
                  >
                    Quitar
                  </button>
                </li>
              ))}
              {!o.tracks.length && (
                <li className="empty">Silencio… sube la primera pista.</li>
              )}
            </ul>
          </article>
        ))}
        {!obras.length && (
          <p className="empty big">
            Aún no hay obras. Arriba inventa un título y dale a “Crear obra”.
          </p>
        )}
      </div>
    </motion.section>
  )
}
