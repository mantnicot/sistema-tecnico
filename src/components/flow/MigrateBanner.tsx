import { useTavaStore } from '../../store/tavaStore'

export function MigrateBanner() {
  const localMigrateHint = useTavaStore((s) => s.localMigrateHint)
  const migrating = useTavaStore((s) => s.migrating)
  const migrateProgress = useTavaStore((s) => s.migrateProgress)
  const migrateLocalToCloud = useTavaStore((s) => s.migrateLocalToCloud)

  if (!localMigrateHint) return null

  const pct =
    migrateProgress && migrateProgress.total > 0
      ? Math.round((migrateProgress.done / migrateProgress.total) * 100)
      : 0

  return (
    <div className="migrate-banner card">
      <strong>Subir trabajo de este PC a la nube</strong>
      <p className="migrate-desc">
        Tienes datos locales ({localMigrateHint}). Súbelos a Supabase para verlos en cualquier
        dispositivo con la misma cuenta.
      </p>
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
        onClick={() => void migrateLocalToCloud()}
      >
        {migrating ? 'Subiendo…' : 'Subir todo a la nube'}
      </button>
    </div>
  )
}
