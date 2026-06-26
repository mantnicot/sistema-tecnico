import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { isDriveMode } from '../../lib/googleConfig'
import { useTavaStore } from '../../store/tavaStore'
import { AppShell } from '../layout/AppShell'
import { TheaterBackdrop } from '../ui/TheaterBackdrop'

function AuthScreen() {
  const signInWithGoogle = useTavaStore((s) => s.signInWithGoogle)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error al conectar con Google')
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
        <h1>Control técnico con Google Drive</h1>
        <p className="auth-sub">
          Tu música, guiones y marcas se guardan en una carpeta <strong>TAVA</strong> de tu
          Google Drive. Accede desde cualquier dispositivo con la misma cuenta.
        </p>
        {msg && <p className="auth-msg">{msg}</p>}
        <button type="button" className="btn primary auth-google-btn" disabled={busy} onClick={submit}>
          {busy ? 'Conectando…' : 'Entrar con Google'}
        </button>
        <p className="auth-hint">
          La app solo accede a archivos que ella misma crea en tu Drive.
        </p>
      </motion.div>
    </div>
  )
}

export function AuthGate() {
  const authReady = useTavaStore((s) => s.authReady)
  const driveUser = useTavaStore((s) => s.driveUser)
  const initAuth = useTavaStore((s) => s.initAuth)

  useEffect(() => {
    if (!isDriveMode) return
    initAuth()
  }, [initAuth])

  if (!authReady) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <span className="pulse-dot" />
          <p>Conectando con Google Drive…</p>
        </div>
      </div>
    )
  }

  if (isDriveMode && !driveUser) {
    return <AuthScreen />
  }

  return <AppShell />
}
