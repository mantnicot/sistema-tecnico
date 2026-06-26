import { getAccessToken } from './googleAuth'
import { TAVA_DATA_FILE, TAVA_ROOT_NAME } from './googleConfig'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

const folderCache = new Map<string, string>()
const blobUrlCache = new Map<string, string>()

let rootFolderId: string | null = null
let syncFileId: string | null = null

async function driveFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken()
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `Drive API ${res.status}`)
  }
  return res
}

async function searchFiles(q: string): Promise<Array<{ id: string; name: string }>> {
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name)',
    pageSize: '20',
  })
  const res = await driveFetch(`/files?${params}`)
  const data = (await res.json()) as { files?: Array<{ id: string; name: string }> }
  return data.files ?? []
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) body.parents = [parentId]
  const res = await driveFetch('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { id: string }
  return data.id
}

async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const key = `${parentId ?? 'root'}:${name}`
  const hit = folderCache.get(key)
  if (hit) return hit

  let q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  if (parentId) q += ` and '${parentId}' in parents`
  const found = await searchFiles(q)
  const id = found[0]?.id ?? (await createFolder(name, parentId))
  folderCache.set(key, id)
  return id
}

export async function getTavaRootFolder(): Promise<string> {
  if (rootFolderId) return rootFolderId
  const q = `name='${TAVA_ROOT_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='tavaApp' and value='1' }`
  const found = await searchFiles(q)
  if (found[0]?.id) {
    rootFolderId = found[0].id
    return rootFolderId
  }
  const token = await getAccessToken()
  const res = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: TAVA_ROOT_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { tavaApp: '1' },
    }),
  })
  if (!res.ok) throw new Error('No se pudo crear la carpeta TAVA en Drive')
  const data = (await res.json()) as { id: string }
  rootFolderId = data.id
  return rootFolderId
}

export async function getAudioFolder(obraId: string): Promise<string> {
  const root = await getTavaRootFolder()
  const audioRoot = await findOrCreateFolder('audio', root)
  return findOrCreateFolder(obraId, audioRoot)
}

export async function getScriptsFolder(): Promise<string> {
  const root = await getTavaRootFolder()
  return findOrCreateFolder('scripts', root)
}

export async function uploadDriveFile(
  name: string,
  mimeType: string,
  data: Blob,
  parentId: string,
): Promise<string> {
  const token = await getAccessToken()
  const metadata = { name, mimeType, parents: [parentId] }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', data)

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) throw new Error('Error al subir archivo a Drive')
  const json = (await res.json()) as { id: string }
  return json.id
}

export async function updateDriveFile(fileId: string, data: Blob, mimeType: string) {
  const token = await getAccessToken()
  const res = await fetch(`${UPLOAD_API}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: data,
  })
  if (!res.ok) throw new Error('Error al actualizar archivo en Drive')
}

export async function deleteDriveFile(fileId: string) {
  revokeDriveBlobUrl(fileId)
  await driveFetch(`/files/${fileId}`, { method: 'DELETE' })
}

export async function downloadDriveBlob(fileId: string, mimeType: string): Promise<Blob> {
  const res = await driveFetch(`/files/${fileId}?alt=media`)
  const blob = await res.blob()
  return new Blob([blob], { type: mimeType })
}

export function getDrivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`
}

export function getDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

export function getCachedDriveBlobUrl(fileId: string): string | undefined {
  return blobUrlCache.get(fileId)
}

export function revokeDriveBlobUrl(fileId: string) {
  const u = blobUrlCache.get(fileId)
  if (u) URL.revokeObjectURL(u)
  blobUrlCache.delete(fileId)
}

export async function resolveDriveAudioUrl(fileId: string, mime = 'audio/mpeg'): Promise<string> {
  const hit = blobUrlCache.get(fileId)
  if (hit) return hit
  const blob = await downloadDriveBlob(fileId, mime)
  const url = URL.createObjectURL(blob)
  blobUrlCache.set(fileId, url)
  return url
}

export async function loadSyncFile(): Promise<{ fileId: string; text: string } | null> {
  const root = await getTavaRootFolder()
  const q = `name='${TAVA_DATA_FILE}' and '${root}' in parents and trashed=false`
  const files = await searchFiles(q)
  if (!files[0]) {
    syncFileId = null
    return null
  }
  syncFileId = files[0].id
  const blob = await downloadDriveBlob(syncFileId, 'application/json')
  const text = await blob.text()
  return { fileId: syncFileId, text }
}

export async function saveSyncFile(json: string) {
  const root = await getTavaRootFolder()
  const blob = new Blob([json], { type: 'application/json' })

  if (syncFileId) {
    try {
      await updateDriveFile(syncFileId, blob, 'application/json')
      return
    } catch {
      syncFileId = null
    }
  }

  const q = `name='${TAVA_DATA_FILE}' and '${root}' in parents and trashed=false`
  const files = await searchFiles(q)
  if (files[0]) {
    syncFileId = files[0].id
    await updateDriveFile(syncFileId, blob, 'application/json')
    return
  }

  syncFileId = await uploadDriveFile(TAVA_DATA_FILE, 'application/json', blob, root)
}

export function resetDriveCache() {
  rootFolderId = null
  syncFileId = null
  folderCache.clear()
  for (const id of blobUrlCache.keys()) revokeDriveBlobUrl(id)
}
