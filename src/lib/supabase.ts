import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

/** Proyecto TAVA en Supabase (anon key es pública en el cliente). */
const DEFAULT_URL = 'https://dvyfnenicifvopjzpayk.supabase.co'
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2eWZuZW5pY2lmdm9wanpwYXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MTY1ODAsImV4cCI6MjA5ODA5MjU4MH0.seVQNMDm-IDzO00hXgmJUvYHPlY-NRSSPc0SAizCO04'

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_URL
export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || DEFAULT_ANON_KEY

/** Modo nube activo salvo que forces local con VITE_TAVA_LOCAL=1 */
export const isCloudMode =
  import.meta.env.VITE_TAVA_LOCAL !== '1' &&
  Boolean(supabaseUrl && supabaseAnonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isCloudMode) throw new Error('Supabase no configurado')
  if (!client) client = createClient(supabaseUrl, supabaseAnonKey)
  return client
}

export type CloudUser = { email: string; id: string }

export function sessionToUser(session: Session | null): CloudUser | null {
  if (!session?.user?.email) return null
  return { id: session.user.id, email: session.user.email }
}

export async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabase()
  const { data } = await sb.auth.getUser()
  return data.user?.id ?? null
}

export function cloudLoginRequired(getUser: () => CloudUser | null): boolean {
  if (!isCloudMode) return false
  return !getUser()
}
