import { useState } from 'react'
import { describeLocalDataForMigrate } from '../../lib/migrateToCloud'
import { isCloudMode } from '../../lib/supabase'
import { useTavaStore } from '../../store/tavaStore'

export function SyncLoginBanner() {
  const cloudUser = useTavaStore((s) => s.cloudUser)
  const signIn = useTavaStore((s) => s.signIn)
  const signUp = useTavaStore((s) => s.signUp)
  const localHint = describeLocalDataForMigrate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (!isCloudMode || cloudUser) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') await signIn(email.trim(), password)
      else {
        await signUp(email.trim(), password)
        setMsg('Cuenta creada. Revisa tu correo si hace falta confirmar, luego entra.')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="migrate-banner card sync-login-banner">
      <strong>Sincronizar con la nube</strong>
      <p className="migrate-desc">
        {localHint
          ? `Datos en este navegador: ${localHint}. Al entrar se suben solos a la nube.`
          : 'Entra o crea cuenta para guardar en la nube.'}
      </p>
      <form className="sync-login-form" onSubmit={submit}>
        <input
          className="inp"
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="inp"
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        {msg && <p className="auth-msg">{msg}</p>}
        <button type="submit" className="btn primary btn-sm" disabled={busy}>
          {busy ? '…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <button
          type="button"
          className="btn ghost btn-sm"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setMsg(null)
          }}
        >
          {mode === 'in' ? 'Registrarse' : 'Ya tengo cuenta'}
        </button>
      </form>
    </div>
  )
}
