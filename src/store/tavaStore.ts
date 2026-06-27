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
import { clearLocalData, LS_KEY, peekLocalData } from '../lib/localData'
import {
  describeLocalDataForMigrate,
  migrateLocalToCloud,
  type MigrateProgress,
} from '../lib/migrateToCloud'
import {
  type CloudUser,
  getCurrentUserId,
  getSupabase,
  isCloudMode,
  sessionToUser,
} from '../lib/supabase'
import {
  deleteAudioFile,
  deleteDocumentFile,
  getCachedStorageUrl,
  resetStorageCache,
  resolveAudioUrl,
  resolveDocumentUrl,
  uploadAudio,
  uploadDocument,
} from '../lib/supabaseStorage'
import * as api from '../lib/tavaApi'
import { extractTextFromPdfBuffer } from '../lib/pdfText'
import { playCueCluster } from '../lib/cuePlayback'

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
  cloudUser: CloudUser | null
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
  localMigrateHint: string | null
  migrating: boolean
  migrateProgress: MigrateProgress | null

  initAuth: () => () => void
  hydrate: () => Promise<void>
  persist: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshLocalMigrateHint: () => void
  migrateLocalToCloud: () => Promise<void>

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
    p: { charOffset: number; trackId: string; cueName: string; mode: CueMode },
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
  if (isCloudMode) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => get().persist(), 350)
}

let activeCluster: { stop: () => void; done: Promise<void> } | null = null

async function loadLocalIntoState(set: (p: Partial<TavaState>) => void) {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LS_KEY)
  } catch {
    /* privado */
  }
  if (!raw) return
  try {
    const p = JSON.parse(raw) as PersistedFlowV1
    if (p.version !== 1) return
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
  } catch {
    /* JSON inválido */
  }
}

async function resolvePlayUrl(blobId: string): Promise<string | undefined> {
  if (isCloudMode) {
    const cached = getCachedStorageUrl(blobId)
    if (cached) return cached
    try {
      return await resolveAudioUrl(blobId)
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
  authReady: !isCloudMode,
  cloudUser: null,
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
  localMigrateHint: null,
  migrating: false,
  migrateProgress: null,

  getBlobUrl: (id) =>
    isCloudMode ? getCachedStorageUrl(id) : localBlobUrlCache.get(id),
  getObra: (id) => (id ? get().obras.find((o) => o.id === id) : undefined),
  getScript: (id) => (id ? get().scripts.find((s) => s.id === id) : undefined),

  ensureBlobUrl: async (blobId, kind) => {
    if (isCloudMode) {
      return kind === 'document' ? resolveDocumentUrl(blobId) : resolvePlayUrl(blobId)
    }
    const hit = localBlobUrlCache.get(blobId)
    if (hit) return hit
    const rec = await getAudioBlob(blobId)
    if (!rec) return undefined
    return setLocalBlobUrl(blobId, rec.data, rec.mime)
  },

  initAuth: () => {
    if (!isCloudMode) return () => {}
    const sb = getSupabase()
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      set({ cloudUser: sessionToUser(session), authReady: true, hydrated: false })
      void get().hydrate()
    })
    void sb.auth.getSession().then(({ data: d }) => {
      set({ cloudUser: sessionToUser(d.session), authReady: true })
      void get().hydrate()
    })
    return () => data.subscription.unsubscribe()
  },

  signIn: async (email, password) => {
    const sb = getSupabase()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const { data: sessionData } = await sb.auth.getSession()
    set({ cloudUser: sessionToUser(sessionData.session), syncError: null, hydrated: false })
    await get().hydrate()
    if (peekLocalData()) {
      get().refreshLocalMigrateHint()
      await get().migrateLocalToCloud()
    }
  },

  signUp: async (email, password) => {
    const sb = getSupabase()
    const { data, error } = await sb.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
    if (data.session) {
      set({ cloudUser: sessionToUser(data.session), syncError: null, hydrated: false })
      await get().hydrate()
      if (peekLocalData()) {
        get().refreshLocalMigrateHint()
        await get().migrateLocalToCloud()
      }
    }
    set({ syncError: null })
  },

  signOut: async () => {
    if (isCloudMode) await getSupabase().auth.signOut()
    resetStorageCache()
    set({
      cloudUser: null,
      obras: [],
      scripts: [],
      technicalObraId: null,
      operatorObraId: null,
      hydrated: false,
      syncError: null,
      migrating: false,
      migrateProgress: null,
    })
    await get().hydrate()
  },

  refreshLocalMigrateHint: () => {
    if (!isCloudMode || !get().cloudUser) {
      set({ localMigrateHint: null })
      return
    }
    set({ localMigrateHint: describeLocalDataForMigrate() })
  },

  migrateLocalToCloud: async () => {
    if (!isCloudMode || !get().cloudUser) {
      set({ syncError: 'Inicia sesión primero.' })
      return
    }
    if (!peekLocalData()) {
      set({ syncError: 'No hay datos locales en este navegador.' })
      return
    }
    set({ migrating: true, migrateProgress: null, syncError: null })
    try {
      const payload = await migrateLocalToCloud((p) => set({ migrateProgress: p }))
      clearLocalData()
      set({
        obras: payload.obras,
        scripts: payload.scripts,
        localMigrateHint: null,
        migrating: false,
        migrateProgress: null,
        syncError: null,
      })
    } catch (e) {
      set({
        migrating: false,
        syncError: e instanceof Error ? e.message : 'Error al migrar',
      })
    }
  },

  hydrate: async () => {
    if (isCloudMode) {
      if (!get().cloudUser) {
        set({ obras: [], scripts: [] })
        await loadLocalIntoState(set)
        set({ hydrated: true, localMigrateHint: null })
        return
      }
      try {
        const data = await api.fetchAllData()
        const local = peekLocalData()
        const cloudEmpty = !(data.obras.length || data.scripts.length)
        if (cloudEmpty && local) {
          set({
            obras: local.obras,
            scripts: local.scripts,
            hydrated: true,
            syncError: null,
          })
        } else {
          set({
            obras: data.obras,
            scripts: data.scripts,
            hydrated: true,
            syncError: null,
          })
        }
        get().refreshLocalMigrateHint()
      } catch (e) {
        set({
          hydrated: true,
          syncError: e instanceof Error ? e.message : 'Error al sincronizar',
        })
      }
      return
    }
    await loadLocalIntoState(set)
    set({ hydrated: true })
  },

  persist: () => {
    if (isCloudMode) return
    const s = get()
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ version: 1, obras: s.obras, scripts: s.scripts } satisfies PersistedFlowV1),
      )
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
    if (isCloudMode && !get().cloudUser) {
      set({ syncError: 'Inicia sesión para guardar en la nube.' })
      return
    }
    const id = crypto.randomUUID()
    const trimmed = name.trim() || 'Obra sin título'
    const o: Obra = { id, name: trimmed, tracks: [], linkedScriptId: null, cues: [] }
    set((st) => ({ obras: [...st.obras, o], syncError: null }))
    if (isCloudMode) {
      try {
        const uid = await getCurrentUserId()
        if (!uid) return
        await api.createObra(uid, id, trimmed)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error al crear obra' })
      }
      return
    }
    schedulePersist(get)
  },

  renameObra: async (id, name) => {
    const trimmed = name.trim()
    set((st) => ({
      obras: st.obras.map((o) => (o.id === id ? { ...o, name: trimmed || o.name } : o)),
    }))
    if (isCloudMode) {
      try {
        await api.updateObraName(id, trimmed)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error al renombrar' })
      }
      return
    }
    schedulePersist(get)
  },

  removeObra: async (id) => {
    const o = get().obras.find((x) => x.id === id)
    if (!o) return
    if (isCloudMode) {
      for (const t of o.tracks) {
        try {
          await deleteAudioFile(t.blobId)
        } catch {
          /* noop */
        }
      }
      try {
        await api.deleteObra(id)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error al eliminar' })
        return
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
    }))
    if (!isCloudMode) schedulePersist(get)
  },

  addTrackToObra: async (obraId, file, displayName) => {
    if (isCloudMode && !get().cloudUser) {
      set({ syncError: 'Inicia sesión para guardar en la nube.' })
      return
    }
    const trackId = crypto.randomUUID()
    const mime = file.type || 'audio/mpeg'
    const trackName = displayName.trim() || file.name.replace(/\.[^.]+$/, '')
    try {
      let blobId: string
      let url: string
      if (isCloudMode) {
        const uid = await getCurrentUserId()
        if (!uid) return
        blobId = await uploadAudio(uid, obraId, trackId, file)
        url = await resolveAudioUrl(blobId)
      } else {
        const buf = await file.arrayBuffer()
        blobId = crypto.randomUUID()
        await putAudioBlob(blobId, buf, mime)
        url = setLocalBlobUrl(blobId, buf, mime)
      }
      const durationSec = await audioDuration(url)
      const track: ObraTrack = { id: trackId, name: trackName, blobId, durationSec }
      if (isCloudMode) {
        const obra = get().obras.find((o) => o.id === obraId)
        await api.insertTrack(obraId, track, obra?.tracks.length ?? 0)
      }
      set((st) => ({
        obras: st.obras.map((o) =>
          o.id === obraId ? { ...o, tracks: [...o.tracks, track] } : o,
        ),
        syncError: null,
      }))
      if (!isCloudMode) schedulePersist(get)
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : 'Error al subir pista' })
    }
  },

  renameTrack: async (obraId, trackId, name) => {
    const trimmed = name.trim()
    set((st) => ({
      obras: st.obras.map((o) =>
        o.id !== obraId
          ? o
          : {
              ...o,
              tracks: o.tracks.map((t) =>
                t.id === trackId ? { ...t, name: trimmed || t.name } : t,
              ),
            },
      ),
    }))
    if (isCloudMode) {
      try {
        await api.updateTrackName(trackId, trimmed)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
      return
    }
    schedulePersist(get)
  },

  removeTrackFromObra: async (obraId, trackId) => {
    const o = get().obras.find((x) => x.id === obraId)
    const track = o?.tracks.find((t) => t.id === trackId)
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
    if (isCloudMode) {
      try {
        await api.deleteTrack(trackId)
        if (blobId) await deleteAudioFile(blobId)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
    } else if (blobId) {
      const used = get().obras.some((ob) => ob.tracks.some((t) => t.blobId === blobId))
      if (!used) {
        await deleteAudioBlob(blobId)
        revokeLocalBlob(blobId)
      }
      schedulePersist(get)
    }
  },

  reorderTrack: async (obraId, from, to) => {
    const obra = get().obras.find((o) => o.id === obraId)
    if (!obra) return
    const arr = [...obra.tracks]
    const [m] = arr.splice(from, 1)
    arr.splice(to, 0, m)
    set((st) => ({
      obras: st.obras.map((o) => (o.id === obraId ? { ...o, tracks: arr } : o)),
    }))
    if (isCloudMode) {
      try {
        await api.reorderTracks(obraId, arr.map((t) => t.id))
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
      return
    }
    schedulePersist(get)
  },

  addScriptText: async (title, text) => {
    if (isCloudMode && !get().cloudUser) {
      set({ syncError: 'Inicia sesión para guardar en la nube.' })
      return
    }
    const script: ScriptDoc = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Guión',
      text,
    }
    if (isCloudMode) {
      try {
        const uid = await getCurrentUserId()
        if (!uid) return
        await api.createScript(uid, script)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
        return
      }
    }
    set((st) => ({ scripts: [...st.scripts, script] }))
    if (!isCloudMode) schedulePersist(get)
  },

  addScriptPdf: async (title, file) => {
    if (isCloudMode && !get().cloudUser) {
      set({ syncError: 'Inicia sesión para guardar en la nube.' })
      return
    }
    const scriptId = crypto.randomUUID()
    const text = await extractTextFromPdfBuffer(await file.arrayBuffer())
    const scriptTitle = title.trim() || file.name.replace(/\.pdf$/i, '')
    const mime = file.type || 'application/pdf'
    try {
      let pdfBlobId: string
      let uid: string | null = null
      if (isCloudMode) {
        uid = await getCurrentUserId()
        if (!uid) return
        pdfBlobId = await uploadDocument(uid, scriptId, file)
      } else {
        const buf = await file.arrayBuffer()
        pdfBlobId = crypto.randomUUID()
        await putAudioBlob(pdfBlobId, buf, mime)
        setLocalBlobUrl(pdfBlobId, buf, mime)
      }
      const script: ScriptDoc = { id: scriptId, title: scriptTitle, text, pdfBlobId }
      if (isCloudMode && uid) {
        await api.createScript(uid, script)
      }
      set((st) => ({ scripts: [...st.scripts, script], syncError: null }))
      if (!isCloudMode) schedulePersist(get)
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : 'Error al subir PDF' })
    }
  },

  replaceScriptPdf: async (scriptId, file) => {
    const text = await extractTextFromPdfBuffer(await file.arrayBuffer())
    const prev = get().scripts.find((s) => s.id === scriptId)
    const mime = file.type || 'application/pdf'
    try {
      let pdfBlobId: string
      if (isCloudMode) {
        const uid = await getCurrentUserId()
        if (!uid) return
        if (prev?.pdfBlobId) {
          try {
            await deleteDocumentFile(prev.pdfBlobId)
          } catch {
            /* noop */
          }
        }
        pdfBlobId = await uploadDocument(uid, scriptId, file)
        await api.updateScript(scriptId, { text, pdfBlobId })
      } else {
        if (prev?.pdfBlobId) {
          await deleteAudioBlob(prev.pdfBlobId)
          revokeLocalBlob(prev.pdfBlobId)
        }
        const buf = await file.arrayBuffer()
        pdfBlobId = crypto.randomUUID()
        await putAudioBlob(pdfBlobId, buf, mime)
        setLocalBlobUrl(pdfBlobId, buf, mime)
      }
      set((st) => ({
        scripts: st.scripts.map((s) =>
          s.id === scriptId ? { ...s, text, pdfBlobId } : s,
        ),
      }))
      if (!isCloudMode) schedulePersist(get)
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : 'Error' })
    }
  },

  replaceScriptText: async (scriptId, title, text) => {
    set((st) => ({
      scripts: st.scripts.map((s) =>
        s.id === scriptId ? { ...s, title: title.trim() || s.title, text } : s,
      ),
    }))
    if (isCloudMode) {
      try {
        await api.updateScript(scriptId, { title: title.trim(), text })
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
      return
    }
    schedulePersist(get)
  },

  renameScript: async (id, title) => {
    set((st) => ({
      scripts: st.scripts.map((s) =>
        s.id === id ? { ...s, title: title.trim() || s.title } : s,
      ),
    }))
    if (isCloudMode) {
      try {
        await api.updateScript(id, { title: title.trim() })
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
      return
    }
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
      if (isCloudMode) {
        try {
          await deleteDocumentFile(s.pdfBlobId)
          await api.deleteScript(id)
        } catch (e) {
          set({ syncError: e instanceof Error ? e.message : 'Error' })
        }
      } else {
        await deleteAudioBlob(s.pdfBlobId)
        revokeLocalBlob(s.pdfBlobId)
        schedulePersist(get)
      }
    } else if (isCloudMode) {
      try {
        await api.deleteScript(id)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
    } else {
      schedulePersist(get)
    }
  },

  linkScriptToObra: async (obraId, scriptId) => {
    set((st) => ({
      obras: st.obras.map((o) =>
        o.id === obraId ? { ...o, linkedScriptId: scriptId } : o,
      ),
    }))
    if (isCloudMode) {
      try {
        await api.linkScriptToObra(obraId, scriptId)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
      return
    }
    schedulePersist(get)
  },

  addCue: async (obraId, p) => {
    let cue: MusicCue | null = null
    set((st) => ({
      obras: st.obras.map((o) => {
        if (o.id !== obraId) return o
        const maxOrder = o.cues
          .filter((c) => c.charOffset === p.charOffset)
          .reduce((m, c) => Math.max(m, c.order), -1)
        cue = {
          id: crypto.randomUUID(),
          charOffset: p.charOffset,
          trackId: p.trackId,
          cueName: p.cueName.trim() || 'Cambio musical',
          mode: p.mode,
          order: maxOrder + 1,
        }
        return { ...o, cues: [...o.cues, cue] }
      }),
    }))
    if (isCloudMode && cue) {
      try {
        await api.insertCue(obraId, cue)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
      return
    }
    schedulePersist(get)
  },

  removeCue: async (obraId, cueId) => {
    set((st) => ({
      obras: st.obras.map((o) =>
        o.id === obraId ? { ...o, cues: o.cues.filter((c) => c.id !== cueId) } : o,
      ),
    }))
    if (isCloudMode) {
      try {
        await api.deleteCue(cueId)
      } catch (e) {
        set({ syncError: e instanceof Error ? e.message : 'Error' })
      }
      return
    }
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
    const g = groups[get().operatorGroupIndex]
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
    set((st) => ({ operatorGroupIndex: Math.max(0, st.operatorGroupIndex - 1) }))
  },
}))
