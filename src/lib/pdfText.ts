import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc

/** Extrae texto de un PDF para teleprompter (100 % local, sin red). */
export async function extractTextFromPdfBuffer(buf: ArrayBuffer): Promise<string> {
  // pdf.js transfiere el buffer al worker y lo deja detached; usar copia.
  const pdf = await getDocument({ data: buf.slice(0) }).promise
  const parts: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it && typeof it.str === 'string' ? it.str : ''))
      .join(' ')
    parts.push(line.trim())
  }
  return parts.filter(Boolean).join('\n\n').trim() || '(PDF sin texto seleccionable)'
}
