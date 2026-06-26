export function formatMmSs(totalSec: number) {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '00:00'
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
