import { useTavaStore } from '../../store/tavaStore'

export function MigrateBanner() {
  const localMigrateHint = useTavaStore((s) => s.localMigrateHint)
  const migrating = useTavaStore((s) => s.migrating)
  const migrateProgress = useTavaStore((s) => s.migrateProgress)
  const migrateLocalToDrive = useTavaStore((s) => s.migrateLocalToDrive)
  const obras = useTavaStore((s) => s.obras)

  if (!localMigrateHint) return null

  const pct =
    migrateProgress && migrateProgress.total > 0
      ? Math.round((migrateProgress.done / migrateProgress.total) * 100)
      : 0

  return (
    <div className="migrate-banner card">
      <strong>Datos en este PC sin subir a Drive</strong>
      <p className="migrate-desc">
        Tienes trabajo guardado solo en este navegador ({localMigrateHint}).
        Súbelo a Google Drive para verlo en cualquier dispositivo con la misma cuenta.
      </p>
      {obras.length === 0 && !migrating && (
        <p className="migrate-warn">
          Tu cuenta de Drive aún no tiene obras cargadas desde aquí.
        </p>
      )}
      {migrating && migrateProgress && (
        <div className="migrate-progress">
          <div className="migrate-bar" style={{ width: `${pct}%` }} />
          <span className="migrate-status">{migrateProgress.label}</span>
        </div>
      )}
      <button
        type="button"
        className="btn primary btn-sm"
        disabled={migrating}
        onClick={() => void migrateLocalToDrive()}
      >
        {migrating ? 'Subiendo a Drive…' : 'Subir todo a Google Drive'}
      </button>
    </div>
  )
}
