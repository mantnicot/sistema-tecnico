import type { PersistedFlowV1 } from '../types/tava'

export const LS_KEY = 'tava-flow-v1'

export function peekLocalData(): PersistedFlowV1 | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PersistedFlowV1
    if (p.version !== 1) return null
    const hasObras = (p.obras?.length ?? 0) > 0
    const hasScripts = (p.scripts?.length ?? 0) > 0
    if (!hasObras && !hasScripts) return null
    return p
  } catch {
    return null
  }
}

export function localDataSummary(data: PersistedFlowV1) {
  const tracks = data.obras.reduce((n, o) => n + o.tracks.length, 0)
  const pdfs = data.scripts.filter((s) => s.pdfBlobId).length
  const cues = data.obras.reduce((n, o) => n + o.cues.length, 0)
  return {
    obras: data.obras.length,
    tracks,
    scripts: data.scripts.length,
    pdfs,
    cues,
  }
}

export function clearLocalData() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* noop */
  }
}
