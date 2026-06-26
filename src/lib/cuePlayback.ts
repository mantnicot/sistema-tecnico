import type { CueMode } from '../types/tava'

/** Reproduce un grupo de pistas en paralelo; respeta modo básico de entrada/salida. */
export function playCueCluster(
  items: { url: string; mode: CueMode }[],
  masterVol = 1,
): { stop: () => void; done: Promise<void> } {
  const audios: HTMLAudioElement[] = []
  const cleanups: Array<() => void> = []

  const stopAll = () => {
    cleanups.forEach((c) => c())
    audios.forEach((a) => {
      try {
        a.pause()
        a.src = ''
      } catch {
        /* noop */
      }
    })
    audios.length = 0
  }

  const done = new Promise<void>((resolve) => {
    let remaining = items.length
    const oneDown = () => {
      remaining -= 1
      if (remaining <= 0) resolve()
    }

    for (const { url, mode } of items) {
      const a = new Audio(url)
      a.volume = Math.max(0, Math.min(1, masterVol))
      audios.push(a)

      const fadeInMs = mode === 'fade_in' ? 1800 : 0
      const fadeOutTail = mode === 'fade_out' ? 2.8 : 0

      const onTime = () => {
        if (fadeOutTail > 0 && Number.isFinite(a.duration) && a.duration > 0) {
          const left = a.duration - a.currentTime
          if (left <= fadeOutTail && left > 0) {
            const t = left / fadeOutTail
            a.volume = Math.max(0, Math.min(1, masterVol * t))
          }
        }
      }

      const start = () => {
        if (fadeInMs > 0) {
          a.volume = 0
          const t0 = performance.now()
          const tick = () => {
            const dt = performance.now() - t0
            a.volume = Math.min(masterVol, masterVol * (dt / fadeInMs))
            if (dt < fadeInMs && !a.paused) requestAnimationFrame(tick)
            else a.volume = masterVol
          }
          requestAnimationFrame(tick)
        }
        if (fadeOutTail > 0) a.addEventListener('timeupdate', onTime)
      }

      a.addEventListener(
        'ended',
        () => {
          a.removeEventListener('timeupdate', onTime)
          oneDown()
        },
        { once: true },
      )
      a.addEventListener('error', oneDown, { once: true })
      cleanups.push(() => a.removeEventListener('timeupdate', onTime))

      void a
        .play()
        .then(start)
        .catch(() => oneDown())
    }
  })

  return { stop: stopAll, done }
}
