import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const isCloudMode = Boolean(url && anonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isCloudMode) throw new Error('Supabase no configurado')
  if (!client) client = createClient(url, anonKey)
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
