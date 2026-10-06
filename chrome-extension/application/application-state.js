/**
 * application/application-state.js
 * Tracks application lifecycle states, application history, and review items.
 */

export const APPLICATION_STATUS = {
  DISCOVERED: 'DISCOVERED',
  ANALYZED: 'ANALYZED',
  LIKED: 'LIKED',
  TAILORED: 'TAILORED',
  FILLED: 'FILLED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  APPLIED: 'APPLIED',
  SUBMITTED: 'SUBMITTED',
  ERROR: 'ERROR',
}

export const APPLICATIONS_STORAGE_KEY = 'jobpilotApplications'

/**
 * Get all tracked applications from storage.
 * @returns {Promise<Array>}
 */
export async function getApplicationsHistory() {
  const data = await chrome.storage.local.get([APPLICATIONS_STORAGE_KEY])
  return data[APPLICATIONS_STORAGE_KEY] || []
}

/**
 * Save or update an application record.
 * @param {object} record
 */
export async function saveApplicationRecord(record) {
  const list = await getApplicationsHistory()
  const id = record.id || `app_${Date.now()}`
  const existingIndex = list.findIndex(a => a.id === id || (a.jobUrl && a.jobUrl === record.jobUrl))

  const entry = {
    id,
    jobTitle: record.jobTitle || 'Unknown Position',
    company: record.company || 'Unknown Company',
    jobUrl: record.jobUrl || '',
    date: record.date || Date.now(),
    fitScore: record.fitScore || 0,
    fields: record.fields || [],
    generatedAnswers: record.generatedAnswers || {},
    status: record.status || APPLICATION_STATUS.DISCOVERED,
    isLiked: record.isLiked !== undefined ? record.isLiked : (existingIndex >= 0 ? list[existingIndex].isLiked : false),
    updatedAt: Date.now(),
  }

  if (existingIndex >= 0) {
    list[existingIndex] = { ...list[existingIndex], ...entry }
  } else {
    list.unshift(entry)
  }

  await chrome.storage.local.set({ [APPLICATIONS_STORAGE_KEY]: list })
  console.log(`[AppState] Saved application: ${entry.jobTitle} at ${entry.company} (${entry.status})`)
  return entry
}

/**
 * Delete an application record.
 * @param {string} id
 */
export async function deleteApplicationRecord(id) {
  const list = await getApplicationsHistory()
  const filtered = list.filter(a => a.id !== id)
  await chrome.storage.local.set({ [APPLICATIONS_STORAGE_KEY]: filtered })
}

/**
 * Update the status of an application.
 * @param {string} id
 * @param {string} status
 */
export async function updateApplicationStatus(id, status) {
  const list = await getApplicationsHistory()
  const item = list.find(a => a.id === id)
  if (item) {
    item.status = status
    item.updatedAt = Date.now()
    await chrome.storage.local.set({ [APPLICATIONS_STORAGE_KEY]: list })
  }
}
