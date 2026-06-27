import type { CueMode, MusicCue, Obra, ObraTrack, ScriptDoc } from '../types/tava'
import { getSupabase } from './supabase'
import { prefetchPaths } from './supabaseStorage'

type DbObra = { id: string; name: string; linked_script_id: string | null }
type DbScript = { id: string; title: string; text: string; pdf_storage_path: string | null }
type DbTrack = {
  id: string
  obra_id: string
  name: string
  storage_path: string
  duration_sec: number
  sort_order: number
}
type DbCue = {
  id: string
  obra_id: string
  char_offset: number
  track_id: string
  cue_name: string
  mode: CueMode
  sort_order: number
}

function assemble(
  obras: DbObra[],
  tracks: DbTrack[],
  cues: DbCue[],
): Obra[] {
  const tMap = new Map<string, DbTrack[]>()
  const cMap = new Map<string, DbCue[]>()
  for (const t of tracks) {
    const a = tMap.get(t.obra_id) ?? []
    a.push(t)
    tMap.set(t.obra_id, a)
  }
  for (const c of cues) {
    const a = cMap.get(c.obra_id) ?? []
    a.push(c)
    cMap.set(c.obra_id, a)
  }
  return obras.map((o) => ({
    id: o.id,
    name: o.name,
    linkedScriptId: o.linked_script_id,
    tracks: (tMap.get(o.id) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(
        (t): ObraTrack => ({
          id: t.id,
          name: t.name,
          blobId: t.storage_path,
          durationSec: t.duration_sec,
        }),
      ),
    cues: (cMap.get(o.id) ?? [])
      .sort((a, b) =>
        a.char_offset !== b.char_offset ? a.char_offset - b.char_offset : a.sort_order - b.sort_order,
      )
      .map(
        (c): MusicCue => ({
          id: c.id,
          charOffset: c.char_offset,
          trackId: c.track_id,
          cueName: c.cue_name,
          mode: c.mode,
          order: c.sort_order,
        }),
      ),
  }))
}

function assembleScripts(rows: DbScript[]): ScriptDoc[] {
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    text: s.text,
    pdfBlobId: s.pdf_storage_path,
  }))
}

export async function fetchAllData(): Promise<{ obras: Obra[]; scripts: ScriptDoc[] }> {
  const sb = getSupabase()
  const [obrasRes, scriptsRes, tracksRes, cuesRes] = await Promise.all([
    sb.from('obras').select('*').order('created_at'),
    sb.from('scripts').select('*').order('created_at'),
    sb.from('tracks').select('*').order('sort_order'),
    sb.from('cues').select('*').order('sort_order'),
  ])
  if (obrasRes.error) throw new Error(obrasRes.error.message)
  if (scriptsRes.error) throw new Error(scriptsRes.error.message)
  if (tracksRes.error) throw new Error(tracksRes.error.message)
  if (cuesRes.error) throw new Error(cuesRes.error.message)

  const obras = assemble(
    obrasRes.data as DbObra[],
    tracksRes.data as DbTrack[],
    cuesRes.data as DbCue[],
  )
  const scripts = assembleScripts(scriptsRes.data as DbScript[])

  const audioPaths = obras.flatMap((o) => o.tracks.map((t) => t.blobId))
  const docPaths = scripts.map((s) => s.pdfBlobId).filter((p): p is string => Boolean(p))
  await Promise.all([
    prefetchPaths(audioPaths, 'tava-audio'),
    prefetchPaths(docPaths, 'tava-documents'),
  ])

  return { obras, scripts }
}

export async function createObra(userId: string, id: string, name: string) {
  const sb = getSupabase()
  const { error } = await sb.from('obras').insert({ id, user_id: userId, name })
  if (error) throw new Error(error.message)
}

export async function updateObraName(id: string, name: string) {
  const sb = getSupabase()
  const { error } = await sb.from('obras').update({ name }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteObra(id: string) {
  const sb = getSupabase()
  const { error } = await sb.from('obras').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function linkScriptToObra(obraId: string, scriptId: string | null) {
  const sb = getSupabase()
  const { error } = await sb.from('obras').update({ linked_script_id: scriptId }).eq('id', obraId)
  if (error) throw new Error(error.message)
}

export async function insertTrack(
  obraId: string,
  track: ObraTrack,
  sortOrder: number,
) {
  const sb = getSupabase()
  const { error } = await sb.from('tracks').insert({
    id: track.id,
    obra_id: obraId,
    name: track.name,
    storage_path: track.blobId,
    duration_sec: track.durationSec,
    sort_order: sortOrder,
  })
  if (error) throw new Error(error.message)
}

export async function updateTrackName(trackId: string, name: string) {
  const sb = getSupabase()
  const { error } = await sb.from('tracks').update({ name }).eq('id', trackId)
  if (error) throw new Error(error.message)
}

export async function deleteTrack(trackId: string) {
  const sb = getSupabase()
  const { error } = await sb.from('tracks').delete().eq('id', trackId)
  if (error) throw new Error(error.message)
}

export async function reorderTracks(obraId: string, trackIds: string[]) {
  const sb = getSupabase()
  await Promise.all(
    trackIds.map((id, idx) =>
      sb.from('tracks').update({ sort_order: idx }).eq('id', id).eq('obra_id', obraId),
    ),
  )
}

export async function createScript(userId: string, script: ScriptDoc) {
  const sb = getSupabase()
  const { error } = await sb.from('scripts').insert({
    id: script.id,
    user_id: userId,
    title: script.title,
    text: script.text,
    pdf_storage_path: script.pdfBlobId ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function updateScript(
  id: string,
  patch: { title?: string; text?: string; pdfBlobId?: string | null },
) {
  const sb = getSupabase()
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.text !== undefined) row.text = patch.text
  if (patch.pdfBlobId !== undefined) row.pdf_storage_path = patch.pdfBlobId
  const { error } = await sb.from('scripts').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteScript(id: string) {
  const sb = getSupabase()
  const { error } = await sb.from('scripts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function insertCue(obraId: string, cue: MusicCue) {
  const sb = getSupabase()
  const { error } = await sb.from('cues').insert({
    id: cue.id,
    obra_id: obraId,
    char_offset: cue.charOffset,
    track_id: cue.trackId,
    cue_name: cue.cueName,
    mode: cue.mode,
    sort_order: cue.order,
  })
  if (error) throw new Error(error.message)
}

export async function deleteCue(cueId: string) {
  const sb = getSupabase()
  const { error } = await sb.from('cues').delete().eq('id', cueId)
  if (error) throw new Error(error.message)
}

/** Importa un proyecto completo (migración desde local). */
export async function importFullProject(
  userId: string,
  obras: Obra[],
  scripts: ScriptDoc[],
) {
  const sb = getSupabase()
  for (const s of scripts) {
    const { error } = await sb.from('scripts').upsert({
      id: s.id,
      user_id: userId,
      title: s.title,
      text: s.text,
      pdf_storage_path: s.pdfBlobId ?? null,
    })
    if (error) throw new Error(error.message)
  }
  for (const o of obras) {
    const { error } = await sb.from('obras').upsert({
      id: o.id,
      user_id: userId,
      name: o.name,
      linked_script_id: o.linkedScriptId,
    })
    if (error) throw new Error(error.message)
    for (let i = 0; i < o.tracks.length; i++) {
      const t = o.tracks[i]
      const { error: te } = await sb.from('tracks').upsert({
        id: t.id,
        obra_id: o.id,
        name: t.name,
        storage_path: t.blobId,
        duration_sec: t.durationSec,
        sort_order: i,
      })
      if (te) throw new Error(te.message)
    }
    for (const c of o.cues) {
      const { error: ce } = await sb.from('cues').upsert({
        id: c.id,
        obra_id: o.id,
        char_offset: c.charOffset,
        track_id: c.trackId,
        cue_name: c.cueName,
        mode: c.mode,
        sort_order: c.order,
      })
      if (ce) throw new Error(ce.message)
    }
  }
}

export async function cloudHasData(): Promise<boolean> {
  const sb = getSupabase()
  const { count, error } = await sb
    .from('obras')
    .select('*', { count: 'exact', head: true })
  if (error) return false
  return (count ?? 0) > 0
}
