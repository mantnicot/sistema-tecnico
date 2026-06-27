import { getSupabase } from './supabase'

const AUDIO_BUCKET = 'tava-audio'
const DOCS_BUCKET = 'tava-documents'
const SIGNED_TTL = 3600

type Cached = { url: string; expiresAt: number }
const urlCache = new Map<string, Cached>()

function extFromFile(file: File): string {
  const m = file.name.match(/\.([^.]+)$/)
  return m ? m[1].toLowerCase() : 'bin'
}

export function getCachedStorageUrl(path: string): string | undefined {
  const hit = urlCache.get(path)
  if (!hit) return undefined
  if (Date.now() >= hit.expiresAt) {
    urlCache.delete(path)
    return undefined
  }
  return hit.url
}

export function revokeCachedUrl(path: string) {
  urlCache.delete(path)
}

export function resetStorageCache() {
  urlCache.clear()
}

async function signedUrl(bucket: string, path: string): Promise<string> {
  const cached = getCachedStorageUrl(path)
  if (cached) return cached
  const sb = getSupabase()
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, SIGNED_TTL)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo obtener URL')
  urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_TTL * 1000 - 60_000 })
  return data.signedUrl
}

export async function uploadAudio(
  userId: string,
  obraId: string,
  trackId: string,
  file: File | Blob,
  fileName?: string,
): Promise<string> {
  const name = fileName ?? (file instanceof File ? file.name : 'track.mp3')
  const path = `${userId}/audio/${obraId}/${trackId}.${extFromFile(file instanceof File ? file : new File([file], name))}`
  const sb = getSupabase()
  const { error } = await sb.storage.from(AUDIO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file instanceof File ? file.type || 'audio/mpeg' : 'audio/mpeg',
  })
  if (error) throw new Error(error.message)
  return path
}

export async function uploadDocument(
  userId: string,
  scriptId: string,
  file: File | Blob,
  fileName?: string,
): Promise<string> {
  const name = fileName ?? (file instanceof File ? file.name : 'script.pdf')
  const ext = extFromFile(file instanceof File ? file : new File([file], name))
  const path = `${userId}/scripts/${scriptId}.${ext}`
  const sb = getSupabase()
  const { error } = await sb.storage.from(DOCS_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file instanceof File ? file.type || 'application/pdf' : 'application/pdf',
  })
  if (error) throw new Error(error.message)
  return path
}

export async function deleteStorageFile(bucket: string, path: string) {
  const sb = getSupabase()
  await sb.storage.from(bucket).remove([path])
  revokeCachedUrl(path)
}

export async function deleteAudioFile(path: string) {
  await deleteStorageFile(AUDIO_BUCKET, path)
}

export async function deleteDocumentFile(path: string) {
  await deleteStorageFile(DOCS_BUCKET, path)
}

export async function resolveAudioUrl(path: string): Promise<string> {
  return signedUrl(AUDIO_BUCKET, path)
}

export async function resolveDocumentUrl(path: string): Promise<string> {
  return signedUrl(DOCS_BUCKET, path)
}

export async function prefetchPaths(paths: string[], bucket: string) {
  await Promise.all(
    paths.map(async (p) => {
      try {
        await signedUrl(bucket, p)
      } catch {
        /* ausente */
      }
    }),
  )
}

export async function downloadAsBlob(path: string, bucket: string, mime: string): Promise<Blob> {
  const url = await signedUrl(bucket, path)
  const res = await fetch(url)
  if (!res.ok) throw new Error('Error al descargar archivo')
  const blob = await res.blob()
  return new Blob([blob], { type: mime })
}
