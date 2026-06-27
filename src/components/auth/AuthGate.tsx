import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { isCloudMode } from '../../lib/supabase'
import { useTavaStore } from '../../store/tavaStore'
import { AppShell } from '../layout/AppShell'
import { TheaterBackdrop } from '../ui/TheaterBackdrop'
import { peekLocalData } from '../../lib/localData'
import { describeLocalDataForMigrate } from '../../lib/migrateToCloud'

function AuthScreen() {
  const signIn = useTavaStore((s) => s.signIn)
  const signUp = useTavaStore((s) => s.signUp)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password)
      } else {
        await signUp(email.trim(), password)
        setMsg('Cuenta creada. Si Supabase pide confirmación, revisa tu correo y luego inicia sesión.')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error de autenticación')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-root">
      <TheaterBackdrop />
      <motion.div
        className="auth-card card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="brand-mark auth-mark">TAVA</div>
        <h1>Control técnico en la nube</h1>
        <p className="auth-sub">
          Obras, guiones y música sincronizados con Supabase. La misma cuenta en cualquier
          dispositivo.
        </p>
        {describeLocalDataForMigrate() && (
          <p className="auth-hint auth-hint--highlight">
            En este navegador hay datos locales ({describeLocalDataForMigrate()}). Al entrar se
            subirán automáticamente a la nube.
          </p>
        )}
        <form className="auth-form" onSubmit={submit}>
          <input
            className="inp"
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className="inp"
            type="password"
            placeholder="Contraseña (mín. 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          />
          {msg && <p className="auth-msg">{msg}</p>}
          <button type="submit" className="btn primary auth-google-btn" disabled={busy}>
            {busy ? 'Conectando…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
        <button
          type="button"
          className="btn ghost auth-toggle"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setMsg(null)
          }}
        >
          {mode === 'in' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </motion.div>
    </div>
  )
}

export function AuthGate() {
  const authReady = useTavaStore((s) => s.authReady)
  const cloudUser = useTavaStore((s) => s.cloudUser)
  const initAuth = useTavaStore((s) => s.initAuth)

  useEffect(() => {
    if (!isCloudMode) return
    return initAuth()
  }, [initAuth])

  if (!authReady && isCloudMode) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <span className="pulse-dot" />
          <p>Conectando con la nube…</p>
        </div>
      </div>
    )
  }

  if (isCloudMode && !cloudUser) {
    if (peekLocalData()) return <AppShell />
    return <AuthScreen />
  }

  return <AppShell />
}
