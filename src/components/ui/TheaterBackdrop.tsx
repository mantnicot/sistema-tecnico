import { motion } from 'framer-motion'

/** Capa ambiental: bruma, viñeta y partículas suaves (solo CSS / motion) */
export function TheaterBackdrop() {
  return (
    <div className="theater-backdrop" aria-hidden>
      <motion.div
        className="theater-orb theater-orb-a"
        animate={{ opacity: [0.08, 0.18, 0.08], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="theater-orb theater-orb-b"
        animate={{ opacity: [0.06, 0.14, 0.06], scale: [1.05, 1, 1.05] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="theater-vignette" />
      <div className="theater-grid" />
    </div>
  )
}
