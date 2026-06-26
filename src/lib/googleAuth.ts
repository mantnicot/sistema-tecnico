import { googleClientId, DRIVE_SCOPES, isDriveMode } from './googleConfig'

export type DriveUser = {
  email: string
  name?: string
  picture?: string
}

type TokenRecord = {
  accessToken: string
  expiresAt: number
  user: DriveUser
}

type TokenClient = {
  callback: (response: GoogleTokenResponse) => void
  requestAccessToken: (options?: { prompt?: string }) => void
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
}

const TOKEN_KEY = 'tava-drive-session'

let tokenClient: TokenClient | null = null
let gisReady: Promise<void> | null = null
let current: TokenRecord | null = null

function loadGisScript(): Promise<void> {
  if (typeof google !== 'undefined' && google.accounts?.oauth2) {
    return Promise.resolve()
  }
  if (gisReady) return gisReady
  gisReady = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tava-gis]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se cargó Google Identity')), {
        once: true,
      })
      return
    }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.dataset.tavaGis = '1'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se cargó Google Identity'))
    document.head.appendChild(s)
  })
  return gisReady
}

function readStored(): TokenRecord | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const rec = JSON.parse(raw) as TokenRecord
    if (!rec.accessToken || !rec.expiresAt || !rec.user?.email) return null
    return rec
  } catch {
    return null
  }
}

function writeStored(rec: TokenRecord | null) {
  if (!rec) {
    sessionStorage.removeItem(TOKEN_KEY)
    return
  }
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(rec))
}

async function fetchUserInfo(token: string): Promise<DriveUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('No se pudo obtener el perfil de Google')
  const data = (await res.json()) as { email?: string; name?: string; picture?: string }
  if (!data.email) throw new Error('Google no devolvió correo')
  return { email: data.email, name: data.name, picture: data.picture }
}

function applyToken(accessToken: string, expiresInSec: number, user?: DriveUser) {
  const expiresAt = Date.now() + expiresInSec * 1000 - 60_000
  if (!current?.user && !user) throw new Error('Falta usuario')
  current = {
    accessToken,
    expiresAt,
    user: user ?? current!.user,
  }
  writeStored(current)
}

function requestAccessToken(prompt: '' | 'consent' = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Cliente Google no inicializado'))
      return
    }
    tokenClient.callback = (resp: GoogleTokenResponse) => {
      if (resp.error) {
        reject(new Error(resp.error))
        return
      }
      if (!resp.access_token) {
        reject(new Error('Sin token de acceso'))
        return
      }
      const finish = (user: DriveUser) => {
        applyToken(resp.access_token!, resp.expires_in ?? 3600, user)
        resolve(resp.access_token!)
      }
      if (current?.user) {
        finish(current.user)
        return
      }
      void fetchUserInfo(resp.access_token)
        .then(finish)
        .catch(reject)
    }
    tokenClient.requestAccessToken({ prompt })
  })
}

export async function initGoogleAuth(): Promise<DriveUser | null> {
  if (!isDriveMode) return null

  await loadGisScript()

  const stored = readStored()
  if (stored) current = stored

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: googleClientId,
    scope: DRIVE_SCOPES,
    callback: () => {},
  })

  if (stored && stored.expiresAt > Date.now()) {
    return stored.user
  }

  if (stored) {
    try {
      await requestAccessToken('')
      return current?.user ?? null
    } catch {
      current = null
      writeStored(null)
      return null
    }
  }

  return null
}

export async function signInWithGoogle(): Promise<DriveUser> {
  await loadGisScript()
  if (!isDriveMode) throw new Error('Google Drive no configurado')

  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: DRIVE_SCOPES,
      callback: () => {},
    })
  }

  await requestAccessToken('consent')
  if (!current?.user) throw new Error('Inicio de sesión incompleto')
  return current.user
}

export function signOutGoogle() {
  const token = current?.accessToken
  current = null
  writeStored(null)
  if (token && typeof google !== 'undefined') {
    google.accounts.oauth2.revoke(token, () => {})
  }
}

export function getDriveUser(): DriveUser | null {
  return current?.user ?? readStored()?.user ?? null
}

export function isGoogleSignedIn(): boolean {
  const rec = current ?? readStored()
  return Boolean(rec?.user?.email)
}

export async function getAccessToken(): Promise<string> {
  const rec = current ?? readStored()
  if (rec && rec.expiresAt > Date.now()) {
    current = rec
    return rec.accessToken
  }
  if (!tokenClient) {
    await initGoogleAuth()
  }
  if (!tokenClient) throw new Error('Inicia sesión con Google')
  return requestAccessToken('')
}
