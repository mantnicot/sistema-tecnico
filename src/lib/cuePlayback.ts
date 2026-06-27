import type { CueMode } from '../types/tava'

export type CuePlayItem = { url: string; mode: CueMode; cacheKey?: string }

export type CueClusterHandle = {
  stop: () => void
  fadeOut: (durationMs?: number) => Promise<void>
  done: Promise<void>
}

const warmCache = new Map<string, { url: string; audio: HTMLAudioElement }>()

/** Precarga audio en segundo plano para que Play responda al instante. */
export async function warmCueAudio(url: string, cacheKey: string): Promise<void> {
  let entry = warmCache.get(cacheKey)
  if (!entry) {
    const audio = new Audio()
    audio.preload = 'auto'
    entry = { url, audio }
    warmCache.set(cacheKey, entry)
  }
  const { audio } = entry
  if (entry.url !== url) {
    entry.url = url
    audio.src = url
  } else if (!audio.src) {
    audio.src = url
  }

  if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return

  await new Promise<void>((resolve) => {
    const done = () => {
      audio.removeEventListener('canplaythrough', done)
      audio.removeEventListener('error', done)
      resolve()
    }
    audio.addEventListener('canplaythrough', done, { once: true })
    audio.addEventListener('error', done, { once: true })
    audio.load()
  })
}

export function clearWarmCache() {
  warmCache.forEach(({ audio }) => {
    try {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    } catch {
      /* noop */
    }
  })
  warmCache.clear()
}

function borrowAudio(url: string, cacheKey?: string): HTMLAudioElement {
  if (cacheKey) {
    const hit = warmCache.get(cacheKey)
    if (hit?.url === url) {
      warmCache.delete(cacheKey)
      return hit.audio
    }
  }
  const a = new Audio(url)
  a.preload = 'auto'
  return a
}

/** Reproduce un grupo de pistas en paralelo; respeta modo básico de entrada/salida. */
export function playCueCluster(
  items: CuePlayItem[],
  masterVol = 1,
): CueClusterHandle {
  const audios: HTMLAudioElement[] = []
  const cleanups: Array<() => void> = []
  let finished = false
  let resolveDone: (() => void) | null = null

  const finish = () => {
    if (finished) return
    finished = true
    resolveDone?.()
    resolveDone = null
  }

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
    finish()
  }

  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
    if (!items.length) {
      finish()
      return
    }

    let remaining = items.length
    const oneDown = () => {
      remaining -= 1
      if (remaining <= 0) finish()
    }

    for (const { url, mode, cacheKey } of items) {
      const a = borrowAudio(url, cacheKey)
      a.volume = Math.max(0, Math.min(1, masterVol))
      audios.push(a)

      const fadeInMs = mode === 'fade_in' ? 900 : 0
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

      const tryPlay = () => {
        void a
          .play()
          .then(start)
          .catch(() => oneDown())
      }

      if (a.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        tryPlay()
      } else {
        a.addEventListener('canplay', tryPlay, { once: true })
        a.addEventListener('error', oneDown, { once: true })
        cleanups.push(() => a.removeEventListener('canplay', tryPlay))
      }
    }
  })

  const fadeOut = (durationMs = 1200): Promise<void> => {
    const playing = audios.filter((a) => !a.paused && a.volume > 0.001)
    if (!playing.length) {
      stopAll()
      return Promise.resolve()
    }
    const startVols = playing.map((a) => a.volume)
    const t0 = performance.now()
    return new Promise((resolve) => {
      const tick = () => {
        const p = Math.min(1, (performance.now() - t0) / durationMs)
        playing.forEach((a, i) => {
          a.volume = startVols[i] * (1 - p)
        })
        if (p < 1) requestAnimationFrame(tick)
        else {
          stopAll()
          resolve()
        }
      }
      requestAnimationFrame(tick)
    })
  }

  return { stop: stopAll, fadeOut, done }
}
