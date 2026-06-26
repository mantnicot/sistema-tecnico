import { useEffect, useState } from 'react'
import { isDriveMode } from '../lib/googleConfig'
import { getDrivePreviewUrl } from '../lib/googleDrive'
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
    if (isDriveMode) {
      setUrl(getDrivePreviewUrl(pdfBlobId))
      return
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

  if (!pdfBlobId) return undefined
  if (isDriveMode) {
    return `https://drive.google.com/file/d/${pdfBlobId}/view`
  }
  return getBlobUrl(pdfBlobId)
}
