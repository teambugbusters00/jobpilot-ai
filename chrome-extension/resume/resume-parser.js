/**
 * resume/resume-parser.js
 * Multi-format resume parser supporting PDF, DOCX, TXT, and MD.
 * Uses local bundled libraries without any external CDNs.
 */

/**
 * Ensure mammoth is available in global scope if loaded.
 */
async function getMammoth() {
  if (typeof globalThis.mammoth !== 'undefined') return globalThis.mammoth
  try {
    const scriptUrl = chrome.runtime.getURL('vendor/mammoth/mammoth.browser.min.js')
    await importScriptsIfPossible(scriptUrl)
    if (typeof globalThis.mammoth !== 'undefined') return globalThis.mammoth
  } catch (err) {
    console.warn('[ResumeParser] Could not load mammoth dynamically:', err)
  }
  return globalThis.mammoth || null
}

/**
 * Ensure PDF.js is available.
 */
async function getPdfJs() {
  if (typeof globalThis.pdfjsLib !== 'undefined') return globalThis.pdfjsLib
  try {
    const scriptUrl = chrome.runtime.getURL('vendor/pdfjs/pdf.min.js')
    await importScriptsIfPossible(scriptUrl)
    if (typeof globalThis.pdfjsLib !== 'undefined') {
      if (globalThis.pdfjsLib.GlobalWorkerOptions) {
        globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdfjs/pdf.worker.min.js')
      }
      return globalThis.pdfjsLib
    }
  } catch (err) {
    console.warn('[ResumeParser] Could not load pdfjsLib dynamically:', err)
  }
  return globalThis.pdfjsLib || null
}

function importScriptsIfPossible(url) {
  return new Promise((resolve, reject) => {
    if (typeof document !== 'undefined') {
      const existing = document.querySelector(`script[src="${url}"]`)
      if (existing) { resolve(); return }
      const s = document.createElement('script')
      s.src = url
      s.onload = () => resolve()
      s.onerror = (e) => reject(new Error(`Failed to load script ${url}`))
      document.head.appendChild(s)
    } else {
      resolve()
    }
  })
}

/**
 * Parse text from ArrayBuffer of a PDF document.
 */
async function parsePdf(arrayBuffer) {
  const pdfjs = await getPdfJs()
  if (!pdfjs) {
    throw new Error('PDF parser library (pdfjs-dist) is not loaded.')
  }

  const typedArray = new Uint8Array(arrayBuffer)
  const loadingTask = pdfjs.getDocument({
    data: typedArray,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })

  const pdf = await loadingTask.promise
  const numPages = pdf.numPages
  const textPieces = []

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
    if (pageText.trim()) {
      textPieces.push(`--- Page ${pageNum} ---\n${pageText}`)
    }
  }

  const fullText = textPieces.join('\n\n').trim()
  if (!fullText) {
    throw new Error('PDF appears to be empty or contains only non-selectable images.')
  }

  return {
    text: fullText,
    metadata: {
      pages: numPages,
      format: 'pdf',
    },
  }
}

/**
 * Parse text from ArrayBuffer of a DOCX document.
 */
async function parseDocx(arrayBuffer) {
  const mammoth = await getMammoth()
  if (!mammoth) {
    throw new Error('DOCX parser library (mammoth) is not loaded.')
  }

  const result = await mammoth.extractRawText({ arrayBuffer })
  const text = (result?.value || '').trim()
  if (!text) {
    throw new Error('DOCX document contains no readable text.')
  }

  return {
    text,
    metadata: {
      format: 'docx',
      messages: result.messages || [],
    },
  }
}

/**
 * Parse a plain text / Markdown file.
 */
async function parsePlainText(file) {
  const text = await file.text()
  if (!text.trim()) {
    throw new Error('Text file is empty.')
  }
  return {
    text: text.trim(),
    metadata: {
      format: file.name.endsWith('.md') ? 'md' : 'txt',
      characterCount: text.length,
    },
  }
}

/**
 * Primary parseResume function.
 * @param {File|Blob} file
 * @returns {Promise<{text: string, metadata: object}>}
 */
export async function parseResume(file) {
  if (!file) {
    throw new Error('No file provided for parsing.')
  }

  const fileName = file.name || 'resume'
  const ext = fileName.split('.').pop().toLowerCase()
  const size = file.size || 0

  if (size > 15 * 1024 * 1024) {
    throw new Error('File size exceeds 15MB limit. Please upload a smaller resume.')
  }

  console.log(`[ResumeParser] Parsing ${fileName} (${ext}, ${Math.round(size / 1024)} KB)`)

  let result
  try {
    if (ext === 'pdf' || file.type === 'application/pdf') {
      const buffer = await file.arrayBuffer()
      result = await parsePdf(buffer)
    } else if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const buffer = await file.arrayBuffer()
      result = await parseDocx(buffer)
    } else if (ext === 'txt' || ext === 'md' || file.type.startsWith('text/')) {
      result = await parsePlainText(file)
    } else {
      // Fallback try reading as text
      try {
        result = await parsePlainText(file)
      } catch {
        throw new Error(`Unsupported file type: .${ext}. Supported formats: PDF, DOCX, TXT, MD.`)
      }
    }

    result.metadata = {
      ...(result.metadata || {}),
      fileName,
      fileSize: size,
      parsedAt: Date.now(),
    }

    return result
  } catch (err) {
    console.error(`[ResumeParser] Error parsing ${fileName}:`, err)
    throw new Error(`Failed to parse ${fileName}: ${err.message}`)
  }
}
