import { create } from 'zustand'
import type {
  CueMode,
  MusicCue,
  Obra,
  ObraTrack,
  PlaybackGroup,
  PersistedFlowV1,
  ScriptDoc,
} from '../types/tava'
import { deleteAudioBlob, getAudioBlob, putAudioBlob } from '../lib/db'
import { loadDriveData, saveDriveData } from '../lib/driveSync'
import { isDriveMode } from '../lib/googleConfig'
import {
  type DriveUser,
  getDriveUser,
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
} from '../lib/googleAuth'
import {
  deleteDriveFile,
  getAudioFolder,
  getCachedDriveBlobUrl,
  getDrivePreviewUrl,
  getDriveViewUrl,
  getScriptsFolder,
  resetDriveCache,
  resolveDriveAudioUrl,
  uploadDriveFile,
} from '../lib/googleDrive'
import { extractTextFromPdfBuffer } from '../lib/pdfText'
import { playCueCluster } from '../lib/cuePlayback'

const LS_KEY = 'tava-flow-v1'

const localBlobUrlCache = new Map<string, string>()

function revokeLocalBlob(blobId: string) {
  const u = localBlobUrlCache.get(blobId)
  if (u) URL.revokeObjectURL(u)
  localBlobUrlCache.delete(blobId)
}

function setLocalBlobUrl(blobId: string, buf: ArrayBuffer, mime: string) {
  revokeLocalBlob(blobId)
  const blob = new Blob([buf], { type: mime || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  localBlobUrlCache.set(blobId, url)
  return url
}

async function audioDuration(url: string): Promise<number> {
  const a = document.createElement('audio')
  a.preload = 'metadata'
  a.src = url
  return new Promise((resolve) => {
    const done = () => {
      const d = a.duration
      resolve(Number.isFinite(d) && d > 0 ? d : 0)
      a.remove()
    }
    a.addEventListener('loadedmetadata', done, { once: true })
    a.addEventListener('error', () => resolve(0), { once: true })
  })
}

export function buildPlaybackGroups(cues: MusicCue[]): PlaybackGroup[] {
  const sorted = [...cues].sort((a, b) =>
    a.charOffset !== b.charOffset ? a.charOffset - b.charOffset : a.order - b.order,
  )
  const map = new Map<number, MusicCue[]>()
  for (const c of sorted) {
    const arr = map.get(c.charOffset) ?? []
    arr.push(c)
    map.set(c.charOffset, arr)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([charOffset, groupCues]) => ({
      charOffset,
      cues: groupCues.sort((x, y) => x.order - y.order),
    }))
}

export type NavKey = 'sounds' | 'scripts' | 'technical' | 'operator'

type TavaState = {
  hydrated: boolean
  authReady: boolean
  driveUser: DriveUser | null
  syncError: string | null
  nav: NavKey
  obras: Obra[]
  scripts: ScriptDoc[]
  technicalObraId: string | null
  operatorObraId: string | null
  operatorGroupIndex: number
  operatorPlaying: boolean
  operatorMasterVol: number
  pendingCueOffset: number

  initAuth: () => void
  hydrate: () => Promise<void>
  persist: () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>

  setNav: (n: NavKey) => void
  setTechnicalObraId: (id: string | null) => void
  setOperatorObraId: (id: string | null) => void
  setPendingCueOffset: (n: number) => void

  addObra: (name: string) => Promise<void>
  renameObra: (id: string, name: string) => Promise<void>
  removeObra: (id: string) => Promise<void>

  addTrackToObra: (obraId: string, file: File, displayName: string) => Promise<void>
  renameTrack: (obraId: string, trackId: string, name: string) => Promise<void>
  removeTrackFromObra: (obraId: string, trackId: string) => Promise<void>
  reorderTrack: (obraId: string, from: number, to: number) => Promise<void>

  addScriptText: (title: string, text: string) => Promise<void>
  addScriptPdf: (title: string, file: File) => Promise<void>
  replaceScriptPdf: (scriptId: string, file: File) => Promise<void>
  replaceScriptText: (scriptId: string, title: string, text: string) => Promise<void>
  renameScript: (id: string, title: string) => Promise<void>
  removeScript: (id: string) => Promise<void>

  linkScriptToObra: (obraId: string, scriptId: string | null) => Promise<void>
  addCue: (
    obraId: string,
    p: {
      charOffset: number
      trackId: string
      cueName: string
      mode: CueMode
    },
  ) => Promise<void>
  removeCue: (obraId: string, cueId: string) => Promise<void>

  setOperatorGroupIndex: (i: number) => void
  setOperatorPlaying: (v: boolean) => void
  setOperatorMasterVol: (v: number) => void
  operatorPlay: () => Promise<void>
  operatorPause: () => void
  operatorAdvance: () => void
  operatorRewind: () => void

  getBlobUrl: (blobId: string) => string | undefined
  ensureBlobUrl: (blobId: string, kind: 'audio' | 'document') => Promise<string | undefined>
  getObra: (id: string | null) => Obra | undefined
  getScript: (id: string | null) => ScriptDoc | undefined
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersist(get: () => TavaState) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => get().persist(), isDriveMode ? 600 : 350)
}

let activeCluster: { stop: () => void; done: Promise<void> } | null = null

async function resolvePlayUrl(blobId: string, mime = 'audio/mpeg'): Promise<string | undefined> {
  if (isDriveMode) {
    const cached = getCachedDriveBlobUrl(blobId)
    if (cached) return cached
    try {
      return await resolveDriveAudioUrl(blobId, mime)
    } catch {
      return undefined
    }
  }
  const cached = localBlobUrlCache.get(blobId)
  if (cached) return cached
  const rec = await getAudioBlob(blobId)
  if (!rec) return undefined
  return setLocalBlobUrl(blobId, rec.data, rec.mime)
}

export const useTavaStore = create<TavaState>((set, get) => ({
  hydrated: false,
  authReady: !isDriveMode,
  driveUser: null,
  syncError: null,
  nav: 'sounds',
  obras: [],
  scripts: [],
  technicalObraId: null,
  operatorObraId: null,
  operatorGroupIndex: 0,
  operatorPlaying: false,
  operatorMasterVol: 0.9,
  pendingCueOffset: 0,

  getBlobUrl: (id) => {
    if (isDriveMode) {
      const cached = getCachedDriveBlobUrl(id)
      if (cached) return cached
      return getDrivePreviewUrl(id)
    }
    return localBlobUrlCache.get(id)
  },

  getObra: (id) => (id ? get().obras.find((o) => o.id === id) : undefined),
  getScript: (id) => (id ? get().scripts.find((s) => s.id === id) : undefined),

  ensureBlobUrl: async (blobId, kind) => {
    if (isDriveMode) {
      if (kind === 'document') return getDriveViewUrl(blobId)
      return resolvePlayUrl(blobId)
    }
    const hit = localBlobUrlCache.get(blobId)
    if (hit) return hit
    const rec = await getAudioBlob(blobId)
    if (!rec) return undefined
    return setLocalBlobUrl(blobId, rec.data, rec.mime)
  },

  initAuth: () => {
    if (!isDriveMode) return
    void initGoogleAuth().then((user) => {
      set({ driveUser: user, authReady: true })
      void get().hydrate()
    })
  },

  signInWithGoogle: async () => {
    const user = await signInWithGoogle()
    set({ driveUser: user, syncError: null, hydrated: false })
    await get().hydrate()
  },

  signOut: async () => {
    signOutGoogle()
    resetDriveCache()
    set({
      driveUser: null,
      obras: [],
      scripts: [],
      technicalObraId: null,
      operatorObraId: null,
      hydrated: true,
      syncError: null,
    })
  },

  hydrate: async () => {
    if (isDriveMode) {
      if (!getDriveUser()) {
        set({ hydrated: true, obras: [], scripts: [] })
        return
      }
      try {
        const data = await loadDriveData()
        set({
          obras: data?.obras ?? [],
          scripts: data?.scripts ?? [],
          hydrated: true,
          syncError: null,
          driveUser: getDriveUser(),
        })
      } catch (e) {
        set({
          hydrated: true,
          syncError: e instanceof Error ? e.message : 'Error al leer Google Drive',
          driveUser: getDriveUser(),
        })
      }
      return
    }

    let raw: string | null = null
    try {
      raw = localStorage.getItem(LS_KEY)
    } catch {
      /* privado */
    }
    if (raw) {
      try {
        const p = JSON.parse(raw) as PersistedFlowV1
        if (p.version === 1) {
          const blobIds = new Set<string>()
          for (const o of p.obras || []) {
            for (const t of o.tracks || []) blobIds.add(t.blobId)
          }
          for (const s of p.scripts || []) {
            if (s.pdfBlobId) blobIds.add(s.pdfBlobId)
          }
          for (const bid of blobIds) {
            const rec = await getAudioBlob(bid)
            if (rec) setLocalBlobUrl(bid, rec.data, rec.mime)
          }
          set({ obras: p.obras || [], scripts: p.scripts || [] })
        }
      } catch {
        /* JSON inválido */
      }
    }
    set({ hydrated: true })
  },

  persist: () => {
    const s = get()
    const payload: PersistedFlowV1 = {
      version: 1,
      obras: s.obras,
      scripts: s.scripts,
    }
    if (isDriveMode) {
      if (!getDriveUser()) return
      void saveDriveData(payload).catch((e) => {
        set({ syncError: e instanceof Error ? e.message : 'Error al guardar en Drive' })
      })
      return
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload))
    } catch {
      /* quota */
    }
  },

  setNav: (n) => set({ nav: n }),
  setTechnicalObraId: (id) => set({ technicalObraId: id }),
  setOperatorObraId: (id) =>
    set({ operatorObraId: id, operatorGroupIndex: 0, operatorPlaying: false }),
  setPendingCueOffset: (n) => set({ pendingCueOffset: Math.max(0, n) }),

  addObra: async (name) => {
    const o: Obra = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Obra sin título',
      tracks: [],
      linkedScriptId: null,
      cues: [],
    }
    set((st) => ({ obras: [...st.obras, o], syncError: null }))
    schedulePersist(get)
  },

  renameObra: async (id, name) => {
    set((st) => ({
      obras: st.obras.map((o) => (o.id === id ? { ...o, name: name.trim() || o.name } : o)),
      syncError: null,
    }))
    schedulePersist(get)
  },

  removeObra: async (id) => {
    const o = get().obras.find((x) => x.id === id)
    if (!o) return
    if (isDriveMode) {
      for (const t of o.tracks) {
        try {
          await deleteDriveFile(t.blobId)
        } catch {
          /* ya borrado */
        }
      }
    } else {
      for (const t of o.tracks) {
        await deleteAudioBlob(t.blobId)
        revokeLocalBlob(t.blobId)
      }
    }
    set((st) => ({
      obras: st.obras.filter((x) => x.id !== id),
      technicalObraId: st.technicalObraId === id ? null : st.technicalObraId,
      operatorObraId: st.operatorObraId === id ? null : st.operatorObraId,
      syncError: null,
    }))
    schedulePersist(get)
  },

  addTrackToObra: async (obraId, file, displayName) => {
    const trackId = crypto.randomUUID()
    const mime = file.type || 'audio/mpeg'
    const trackName = displayName.trim() || file.name.replace(/\.[^.]+$/, '')

    try {
      let blobId: string
      let url: string

      if (isDriveMode) {
        const folder = await getAudioFolder(obraId)
        blobId = await uploadDriveFile(file.name, mime, file, folder)
        url = await resolveDriveAudioUrl(blobId, mime)
      } else {
        const buf = await file.arrayBuffer()
        blobId = crypto.randomUUID()
        await putAudioBlob(blobId, buf, mime)
        url = setLocalBlobUrl(blobId, buf, mime)
      }

      const durationSec = await audioDuration(url)
      const track: ObraTrack = { id: trackId, name: trackName, blobId, durationSec }
      set((st) => ({
        obras: st.obras.map((o) =>
          o.id === obraId ? { ...o, tracks: [...o.tracks, track] } : o,
        ),
        syncError: null,
      }))
      schedulePersist(get)
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : 'Error al subir pista' })
    }
  },

  renameTrack: async (obraId, trackId, name) => {
    set((st) => ({
      obras: st.obras.map((o) =>
        o.id !== obraId
          ? o
          : {
              ...o,
              tracks: o.tracks.map((t) =>
                t.id === trackId ? { ...t, name: name.trim() || t.name } : t,
              ),
            },
      ),
      syncError: null,
    }))
    schedulePersist(get)
  },

  removeTrackFromObra: async (obraId, trackId) => {
    const o = get().obras.find((x) => x.id === obraId)
    if (!o) return
    const track = o.tracks.find((t) => t.id === trackId)
    const blobId = track?.blobId

    set((st) => ({
      obras: st.obras.map((ob) =>
        ob.id !== obraId
          ? ob
          : {
              ...ob,
              tracks: ob.tracks.filter((t) => t.id !== trackId),
              cues: ob.cues.filter((c) => c.trackId !== trackId),
            },
      ),
    }))

    if (blobId) {
      if (isDriveMode) {
        const used = get().obras.some((ob) => ob.tracks.some((t) => t.blobId === blobId))
        if (!used) {
          try {
            await deleteDriveFile(blobId)
          } catch {
            /* noop */
          }
        }
      } else {
        const used = get().obras.some((ob) => ob.tracks.some((t) => t.blobId === blobId))
        if (!used) {
          await deleteAudioBlob(blobId)
          revokeLocalBlob(blobId)
        }
      }
    }
    set({ syncError: null })
    schedulePersist(get)
  },

  reorderTrack: async (obraId, from, to) => {
    set((st) => ({
      obras: st.obras.map((o) => {
        if (o.id !== obraId) return o
        const arr = [...o.tracks]
        const [m] = arr.splice(from, 1)
        arr.splice(to, 0, m)
        return { ...o, tracks: arr }
      }),
      syncError: null,
    }))
    schedulePersist(get)
  },

  addScriptText: async (title, text) => {
    const script: ScriptDoc = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Guión',
      text,
    }
    set((st) => ({ scripts: [...st.scripts, script], syncError: null }))
    schedulePersist(get)
  },

  addScriptPdf: async (title, file) => {
    const scriptId = crypto.randomUUID()
    const buf = await file.arrayBuffer()
    const text = await extractTextFromPdfBuffer(buf)
    const scriptTitle = title.trim() || file.name.replace(/\.pdf$/i, '')
    const mime = file.type || 'application/pdf'

    try {
      let pdfBlobId: string
      if (isDriveMode) {
        const folder = await getScriptsFolder()
        pdfBlobId = await uploadDriveFile(file.name, mime, file, folder)
      } else {
        pdfBlobId = crypto.randomUUID()
        await putAudioBlob(pdfBlobId, buf, mime)
        setLocalBlobUrl(pdfBlobId, buf, mime)
      }
      const script: ScriptDoc = { id: scriptId, title: scriptTitle, text, pdfBlobId }
      set((st) => ({ scripts: [...st.scripts, script], syncError: null }))
      schedulePersist(get)
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : 'Error al subir PDF' })
    }
  },

  replaceScriptPdf: async (scriptId, file) => {
    const buf = await file.arrayBuffer()
    const text = await extractTextFromPdfBuffer(buf)
    const prev = get().scripts.find((s) => s.id === scriptId)
    const mime = file.type || 'application/pdf'

    try {
      let pdfBlobId: string
      if (isDriveMode) {
        if (prev?.pdfBlobId) {
          try {
            await deleteDriveFile(prev.pdfBlobId)
          } catch {
            /* noop */
          }
        }
        const folder = await getScriptsFolder()
        pdfBlobId = await uploadDriveFile(file.name, mime, file, folder)
      } else {
        if (prev?.pdfBlobId) {
          await deleteAudioBlob(prev.pdfBlobId)
          revokeLocalBlob(prev.pdfBlobId)
        }
        pdfBlobId = crypto.randomUUID()
        await putAudioBlob(pdfBlobId, buf, mime)
        setLocalBlobUrl(pdfBlobId, buf, mime)
      }
      set((st) => ({
        scripts: st.scripts.map((s) =>
          s.id === scriptId ? { ...s, text, pdfBlobId } : s,
        ),
        syncError: null,
      }))
      schedulePersist(get)
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : 'Error al reemplazar PDF' })
    }
  },

  replaceScriptText: async (scriptId, title, text) => {
    set((st) => ({
      scripts: st.scripts.map((s) =>
        s.id === scriptId ? { ...s, title: title.trim() || s.title, text } : s,
      ),
      syncError: null,
    }))
    schedulePersist(get)
  },

  renameScript: async (id, title) => {
    set((st) => ({
      scripts: st.scripts.map((s) =>
        s.id === id ? { ...s, title: title.trim() || s.title } : s,
      ),
      syncError: null,
    }))
    schedulePersist(get)
  },

  removeScript: async (id) => {
    const s = get().scripts.find((x) => x.id === id)
    set((st) => ({
      scripts: st.scripts.filter((x) => x.id !== id),
      obras: st.obras.map((o) =>
        o.linkedScriptId === id ? { ...o, linkedScriptId: null } : o,
      ),
    }))
    if (s?.pdfBlobId) {
      if (isDriveMode) {
        try {
          await deleteDriveFile(s.pdfBlobId)
        } catch {
          /* noop */
        }
      } else {
        await deleteAudioBlob(s.pdfBlobId)
        revokeLocalBlob(s.pdfBlobId)
      }
    }
    set({ syncError: null })
    schedulePersist(get)
  },

  linkScriptToObra: async (obraId, scriptId) => {
    set((st) => ({
      obras: st.obras.map((o) =>
        o.id === obraId ? { ...o, linkedScriptId: scriptId } : o,
      ),
      syncError: null,
    }))
    schedulePersist(get)
  },

  addCue: async (obraId, p) => {
    set((st) => ({
      obras: st.obras.map((o) => {
        if (o.id !== obraId) return o
        const maxOrder = o.cues
          .filter((c) => c.charOffset === p.charOffset)
          .reduce((m, c) => Math.max(m, c.order), -1)
        const cue: MusicCue = {
          id: crypto.randomUUID(),
          charOffset: p.charOffset,
          trackId: p.trackId,
          cueName: p.cueName.trim() || 'Cambio musical',
          mode: p.mode,
          order: maxOrder + 1,
        }
        return { ...o, cues: [...o.cues, cue] }
      }),
      syncError: null,
    }))
    schedulePersist(get)
  },

  removeCue: async (obraId, cueId) => {
    set((st) => ({
      obras: st.obras.map((o) =>
        o.id === obraId ? { ...o, cues: o.cues.filter((c) => c.id !== cueId) } : o,
      ),
      syncError: null,
    }))
    schedulePersist(get)
  },

  setOperatorGroupIndex: (i) => {
    const ob = get().getObra(get().operatorObraId ?? null)
    const groups = ob ? buildPlaybackGroups(ob.cues) : []
    const max = Math.max(0, groups.length - 1)
    set({ operatorGroupIndex: Math.max(0, Math.min(max, i)), operatorPlaying: false })
    get().operatorPause()
  },

  setOperatorPlaying: (v) => set({ operatorPlaying: v }),
  setOperatorMasterVol: (v) =>
    set({ operatorMasterVol: Math.max(0, Math.min(1, v)) }),

  operatorPause: () => {
    activeCluster?.stop()
    activeCluster = null
    set({ operatorPlaying: false })
  },

  operatorPlay: async () => {
    const ob = get().getObra(get().operatorObraId ?? null)
    if (!ob?.linkedScriptId) return
    const groups = buildPlaybackGroups(ob.cues)
    if (!groups.length) return
    get().operatorPause()
    const idx = get().operatorGroupIndex
    const g = groups[idx]
    if (!g) return
    const items: { url: string; mode: CueMode }[] = []
    for (const c of g.cues) {
      const tr = ob.tracks.find((t) => t.id === c.trackId)
      if (!tr) continue
      const url = await resolvePlayUrl(tr.blobId)
      if (!url) continue
      items.push({ url, mode: c.mode })
    }
    if (!items.length) return
    activeCluster = playCueCluster(items, get().operatorMasterVol)
    set({ operatorPlaying: true })
    await activeCluster.done
    activeCluster = null
    set({ operatorPlaying: false })
  },

  operatorAdvance: () => {
    get().operatorPause()
    const ob = get().getObra(get().operatorObraId ?? null)
    const n = buildPlaybackGroups(ob?.cues ?? []).length
    set((st) => ({
      operatorGroupIndex: Math.min(Math.max(0, n - 1), st.operatorGroupIndex + 1),
    }))
  },

  operatorRewind: () => {
    get().operatorPause()
    set((st) => ({
      operatorGroupIndex: Math.max(0, st.operatorGroupIndex - 1),
    }))
  },
}))
