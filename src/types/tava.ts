/** Modelo TAVA — obras, música, guiones y marcas técnicas */

export type CueMode = 'fade_in' | 'direct' | 'fade_out'

export type ObraTrack = {
  id: string
  name: string
  blobId: string
  durationSec: number
}

export type MusicCue = {
  id: string
  /** Índice de carácter en el texto del guión (sin decoraciones) */
  charOffset: number
  trackId: string
  cueName: string
  mode: CueMode
  /** Orden estable dentro del mismo charOffset */
  order: number
}

export type Obra = {
  id: string
  name: string
  tracks: ObraTrack[]
  linkedScriptId: string | null
  cues: MusicCue[]
}

export type ScriptDoc = {
  id: string
  title: string
  /** Texto para teleprompter (PDF se convierte a texto localmente) */
  text: string
  pdfBlobId?: string | null
}

export type PlaybackGroup = {
  charOffset: number
  cues: MusicCue[]
}

export type PersistedFlowV1 = {
  version: 1
  obras: Obra[]
  scripts: ScriptDoc[]
}
