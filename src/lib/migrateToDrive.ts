import type { Obra, PersistedFlowV1, ScriptDoc } from '../types/tava'
import { getAudioBlob } from './db'
import { saveDriveData } from './driveSync'
import { getAudioFolder, getScriptsFolder, uploadDriveFile } from './googleDrive'
import { localDataSummary, peekLocalData } from './localData'

export type MigrateProgress = {
  label: string
  done: number
  total: number
}

function extFromMime(mime: string, fallback: string): string {
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('m4a') || mime.includes('mp4')) return 'm4a'
  if (mime.includes('pdf')) return 'pdf'
  return fallback
}

function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'archivo'
}

export async function migrateLocalToDrive(
  onProgress?: (p: MigrateProgress) => void,
): Promise<PersistedFlowV1> {
  const local = peekLocalData()
  if (!local) throw new Error('No hay obras ni guiones guardados en este navegador.')

  const obras: Obra[] = structuredClone(local.obras)
  const scripts: ScriptDoc[] = structuredClone(local.scripts)

  type Job =
    | { kind: 'track'; obraId: string; trackId: string; blobId: string; name: string }
    | { kind: 'pdf'; scriptId: string; blobId: string; name: string }

  const jobs: Job[] = []
  for (const o of obras) {
    for (const t of o.tracks) {
      jobs.push({
        kind: 'track',
        obraId: o.id,
        trackId: t.id,
        blobId: t.blobId,
        name: t.name,
      })
    }
  }
  for (const s of scripts) {
    if (s.pdfBlobId) {
      jobs.push({
        kind: 'pdf',
        scriptId: s.id,
        blobId: s.pdfBlobId,
        name: s.title,
      })
    }
  }

  const total = jobs.length + 1
  let done = 0

  const tick = (label: string) => {
    onProgress?.({ label, done, total })
  }

  tick('Preparando migración…')

  for (const job of jobs) {
    const rec = await getAudioBlob(job.blobId)
    if (!rec) {
      done++
      tick(`Omitido (no encontrado): ${job.name}`)
      continue
    }

    const mime = rec.mime || (job.kind === 'pdf' ? 'application/pdf' : 'audio/mpeg')
    const blob = new Blob([rec.data], { type: mime })
    const ext = extFromMime(mime, job.kind === 'pdf' ? 'pdf' : 'mp3')
    const fileName = `${safeName(job.name)}.${ext}`

    tick(`Subiendo: ${job.name}`)

    if (job.kind === 'track') {
      const folder = await getAudioFolder(job.obraId)
      const fileId = await uploadDriveFile(fileName, mime, blob, folder)
      const obra = obras.find((o) => o.id === job.obraId)
      const track = obra?.tracks.find((t) => t.id === job.trackId)
      if (track) track.blobId = fileId
    } else {
      const folder = await getScriptsFolder()
      const fileId = await uploadDriveFile(fileName, mime, blob, folder)
      const script = scripts.find((s) => s.id === job.scriptId)
      if (script) script.pdfBlobId = fileId
    }

    done++
    onProgress?.({ label: `Listo: ${job.name}`, done, total })
  }

  const payload: PersistedFlowV1 = { version: 1, obras, scripts }
  tick('Guardando índice en Drive…')
  await saveDriveData(payload)
  done++
  onProgress?.({ label: 'Migración completada', done, total })

  return payload
}

export function describeLocalDataForMigrate(): string | null {
  const local = peekLocalData()
  if (!local) return null
  const s = localDataSummary(local)
  const parts = [
    s.obras ? `${s.obras} obra(s)` : null,
    s.tracks ? `${s.tracks} pista(s)` : null,
    s.scripts ? `${s.scripts} guión(es)` : null,
    s.cues ? `${s.cues} marca(s)` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}
