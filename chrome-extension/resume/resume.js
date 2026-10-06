/**
 * resume/resume.js
 * Resume storage & lifecycle management in chrome.storage.local.
 */

import { parseResume } from './resume-parser.js'
import { extractProfileFromResumeText } from './profile.js'

export const RESUME_STORAGE_KEY = 'jobpilotResume'
export const PROFILE_STORAGE_KEY = 'jobpilotProfile'

/**
 * Upload, parse, and store a resume.
 * @param {File} file
 * @returns {Promise<{fileName: string, mimeType: string, text: string, uploadedAt: number, profile: object}>}
 */
export async function uploadAndStoreResume(file) {
  const { text, metadata } = await parseResume(file)

  const resumeRecord = {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    text,
    uploadedAt: Date.now(),
    metadata,
  }

  await chrome.storage.local.set({ [RESUME_STORAGE_KEY]: resumeRecord })

  // Derive structured profile from the parsed resume text
  const derivedProfile = extractProfileFromResumeText(text)

  // Merge with existing user profile if present without overwriting manually edited fields
  const currentProfile = await getStoredProfile()
  const mergedProfile = {
    ...derivedProfile,
    personal: {
      ...derivedProfile.personal,
      ...(currentProfile?.personal || {}),
    },
    // User preferences
    preferredRoles: currentProfile?.preferredRoles || [],
    preferredLocations: currentProfile?.preferredLocations || [],
    workAuthorization: currentProfile?.workAuthorization || '',
    remotePreference: currentProfile?.remotePreference || 'Any',
    currentRole: currentProfile?.currentRole || '',
    graduationYear: currentProfile?.graduationYear || '',
  }

  await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: mergedProfile })

  console.log(`[Resume] Successfully stored resume "${file.name}" and updated profile`)
  return { ...resumeRecord, profile: mergedProfile }
}

/**
 * Retrieve the currently stored resume.
 * @returns {Promise<object|null>}
 */
export async function getStoredResume() {
  const data = await chrome.storage.local.get([RESUME_STORAGE_KEY])
  return data[RESUME_STORAGE_KEY] || null
}

/**
 * Remove stored resume.
 */
export async function removeStoredResume() {
  await chrome.storage.local.remove([RESUME_STORAGE_KEY])
  console.log('[Resume] Stored resume removed')
}

/**
 * Retrieve user profile from storage.
 * @returns {Promise<object|null>}
 */
export async function getStoredProfile() {
  const data = await chrome.storage.local.get([PROFILE_STORAGE_KEY])
  return data[PROFILE_STORAGE_KEY] || null
}

/**
 * Save / update user profile in storage.
 * @param {object} profile
 */
export async function saveStoredProfile(profile) {
  await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profile })
  console.log('[Profile] User profile saved')
}
