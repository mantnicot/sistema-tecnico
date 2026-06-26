import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

const DB_NAME = 'tava-theater-db'
const DB_VERSION = 1

type BlobRecord = {
  id: string
  data: ArrayBuffer
  mime: string
  createdAt: number
}

interface TavaDB extends DBSchema {
  audioBlobs: {
    key: string
    value: BlobRecord
  }
}

let dbPromise: Promise<IDBPDatabase<TavaDB>> | null = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TavaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('audioBlobs')) {
          db.createObjectStore('audioBlobs', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function putAudioBlob(
  id: string,
  data: ArrayBuffer,
  mime: string,
) {
  const db = await getDB()
  await db.put('audioBlobs', {
    id,
    data,
    mime,
    createdAt: Date.now(),
  })
}

export async function getAudioBlob(id: string): Promise<BlobRecord | undefined> {
  const db = await getDB()
  return db.get('audioBlobs', id)
}

export async function deleteAudioBlob(id: string) {
  const db = await getDB()
  await db.delete('audioBlobs', id)
}
