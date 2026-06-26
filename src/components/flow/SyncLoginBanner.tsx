import { describeLocalDataForMigrate } from '../../lib/migrateToDrive'
import { useTavaStore } from '../../store/tavaStore'

export function SyncLoginBanner() {
  const driveUser = useTavaStore((s) => s.driveUser)
  const signInWithGoogle = useTavaStore((s) => s.signInWithGoogle)
  const localHint = describeLocalDataForMigrate()

  if (driveUser) return null

  return (
    <div className="migrate-banner card sync-login-banner">
      <strong>Sincronizar con Google Drive</strong>
      <p className="migrate-desc">
        {localHint
          ? `Tienes trabajo en este PC (${localHint}). Entra con Google para subirlo y verlo en cualquier dispositivo.`
          : 'Entra con Google para guardar obras y música en tu Drive.'}
      </p>
      <button
        type="button"
        className="btn primary btn-sm"
        onClick={() => void signInWithGoogle()}
      >
        Entrar con Google
      </button>
    </div>
  )
}
