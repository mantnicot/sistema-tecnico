import type { PersistedFlowV1 } from '../types/tava'
import { loadSyncFile, saveSyncFile } from './googleDrive'

export async function loadDriveData(): Promise<PersistedFlowV1 | null> {
  const file = await loadSyncFile()
  if (!file?.text) return null
  try {
    const p = JSON.parse(file.text) as PersistedFlowV1
    if (p.version === 1) return p
  } catch {
    /* JSON inválido */
  }
  return null
}

export async function saveDriveData(data: PersistedFlowV1) {
  await saveSyncFile(JSON.stringify(data))
}
