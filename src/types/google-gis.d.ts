/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface GoogleTokenClient {
  callback: (response: GoogleTokenResponse) => void
  requestAccessToken: (options?: { prompt?: string }) => void
}

declare global {
  const google: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string
          scope: string
          callback: (response: GoogleTokenResponse) => void
        }) => GoogleTokenClient
        revoke: (token: string, callback: () => void) => void
      }
    }
  }
}

export {}
