import { useEffect } from 'react'
import { TheaterBackdrop } from '../ui/TheaterBackdrop'
import { isDriveMode } from '../../lib/googleConfig'
import { useTavaStore, type NavKey } from '../../store/tavaStore'
import { SoundManagement } from '../flow/SoundManagement'
import { ScriptManagement } from '../flow/ScriptManagement'
import { TechnicalDesk } from '../flow/TechnicalDesk'
import { OperatorDesk } from '../flow/OperatorDesk'
import { MigrateBanner } from '../flow/MigrateBanner'
import { SyncLoginBanner } from '../flow/SyncLoginBanner'

const NAV: { id: NavKey; label: string; kicker: string }[] = [
  {
    id: 'sounds',
    label: 'Gestión de sonidos',
    kicker: 'Crea obras, sube MP3 y ordena pistas antes del ensayo',
  },
  {
    id: 'scripts',
    label: 'Gestión de guiones',
    kicker: 'Texto o PDF: el texto alimenta el teleprompter con marcas',
  },
  {
    id: 'technical',
    label: 'Gestión técnica',
    kicker: 'Clic + arrastre: coloca cada corte en el punto exacto del guión',
  },
  {
    id: 'operator',
    label: 'Técnico',
    kicker: 'Lista de marcas, Play/Pausa y volumen para la función',
  },
]

export function AppShell() {
  const hydrated = useTavaStore((s) => s.hydrated)
  const hydrate = useTavaStore((s) => s.hydrate)
  const nav = useTavaStore((s) => s.nav)
  const setNav = useTavaStore((s) => s.setNav)
  const driveUser = useTavaStore((s) => s.driveUser)
  const syncError = useTavaStore((s) => s.syncError)
  const signOut = useTavaStore((s) => s.signOut)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!hydrated) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <span className="pulse-dot" />
          <p>
            {isDriveMode
              ? 'Sincronizando desde Google Drive…'
              : 'Despertando al equipo de luces… y a la base de datos local.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-root flow-app">
      <TheaterBackdrop />
      <aside className="app-sidebar flow-sidebar">
        <header className="brand flow-brand">
          <div className="brand-mark">TAVA</div>
          <div>
            <h1>Control técnico</h1>
            <p className="brand-tag">
              {isDriveMode ? 'Google Drive · sincronizado' : '100 % local · sin internet'}
            </p>
          </div>
        </header>
        {isDriveMode && driveUser && (
          <div className="cloud-user card">
            <span className="cloud-email" title={driveUser.email}>
              {driveUser.email}
            </span>
            <button type="button" className="btn ghost btn-sm" onClick={() => void signOut()}>
              Salir
            </button>
          </div>
        )}
        {syncError && <p className="sync-error">{syncError}</p>}
        <SyncLoginBanner />
        <MigrateBanner />
        <nav className="side-nav flow-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`side-nav-btn flow-nav-btn ${nav === item.id ? 'active' : ''}`}
              onClick={() => setNav(item.id)}
            >
              <span className="flow-nav-label">{item.label}</span>
              <span className="flow-nav-kick">{item.kicker}</span>
            </button>
          ))}
        </nav>
        <footer className="side-foot flow-foot">
          <span className="quip">
            “Si el sonido falla, mira al público: ellos creen que es dramaturgia.”
          </span>
        </footer>
      </aside>
      <main className="app-main flow-main">
        {nav === 'sounds' && <SoundManagement />}
        {nav === 'scripts' && <ScriptManagement />}
        {nav === 'technical' && <TechnicalDesk />}
        {nav === 'operator' && <OperatorDesk />}
      </main>
    </div>
  )
}
