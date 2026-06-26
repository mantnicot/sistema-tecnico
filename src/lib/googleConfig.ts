/** Configuración Google Drive / OAuth */

export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? ''

/** Modo sincronizado: archivos y datos en Google Drive del usuario */
export const isDriveMode = Boolean(googleClientId)

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
  'profile',
].join(' ')

export const TAVA_ROOT_NAME = 'TAVA'
export const TAVA_DATA_FILE = 'tava-data.json'
