/** Configuración Google Drive / OAuth */

const DEFAULT_GOOGLE_CLIENT_ID =
  '870483472682-t3i95ucgj7qapkumr90bpn4lkrkdlgo0.apps.googleusercontent.com'

export const googleClientId =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || DEFAULT_GOOGLE_CLIENT_ID

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
