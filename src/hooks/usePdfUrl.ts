import { useEffect, useState } from 'react'
import { isCloudMode } from '../lib/supabase'
import { useTavaStore } from '../store/tavaStore'

export function usePdfUrl(pdfBlobId: string | null | undefined): string | null {
  const getBlobUrl = useTavaStore((s) => s.getBlobUrl)
  const ensureBlobUrl = useTavaStore((s) => s.ensureBlobUrl)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!pdfBlobId) {
      setUrl(null)
      return
    }
    if (isCloudMode) {
      let cancelled = false
      void ensureBlobUrl(pdfBlobId, 'document').then((u) => {
        if (!cancelled) setUrl(u ? `${u}#toolbar=0` : null)
      })
      return () => {
        cancelled = true
      }
    }
    const cached = getBlobUrl(pdfBlobId)
    if (cached) {
      setUrl(`${cached}#toolbar=0`)
      return
    }
    let cancelled = false
    void ensureBlobUrl(pdfBlobId, 'document').then((u) => {
      if (!cancelled) setUrl(u ? `${u}#toolbar=0` : null)
    })
    return () => {
      cancelled = true
    }
  }, [pdfBlobId, getBlobUrl, ensureBlobUrl])

  return url
}

export function usePdfHref(pdfBlobId: string | null | undefined): string | undefined {
  const getBlobUrl = useTavaStore((s) => s.getBlobUrl)
  const ensureBlobUrl = useTavaStore((s) => s.ensureBlobUrl)
  const [href, setHref] = useState<string | undefined>(() =>
    pdfBlobId && !isCloudMode ? getBlobUrl(pdfBlobId) : undefined,
  )

  useEffect(() => {
    if (!pdfBlobId) {
      setHref(undefined)
      return
    }
    if (isCloudMode) {
      void ensureBlobUrl(pdfBlobId, 'document').then(setHref)
      return
    }
    setHref(getBlobUrl(pdfBlobId))
  }, [pdfBlobId, getBlobUrl, ensureBlobUrl])

  return href
}
