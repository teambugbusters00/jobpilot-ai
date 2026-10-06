/**
 * profile/profile.js
 * User profile definition and CRUD.
 * Higher-confidence structured information than LLM guesses.
 */

import { PROFILE_STORAGE_KEY, getStoredProfile, saveStoredProfile } from '../resume/resume.js'

export const DEFAULT_PROFILE = {
  personal: {
    name: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    github: '',
    portfolio: '',
  },
  currentRole: '',
  education: [],
  graduationYear: '',
  preferredRoles: [],
  preferredLocations: [],
  workAuthorization: '',
  remotePreference: 'Any', // 'Remote' | 'Hybrid' | 'On-site' | 'Any'
  salaryExpectation: '',
  skills: [],
}

/**
 * Load complete profile with defaults filled in.
 */
export async function loadUserProfile() {
  const stored = await getStoredProfile()
  if (!stored) return { ...DEFAULT_PROFILE }
  return {
    ...DEFAULT_PROFILE,
    ...stored,
    personal: {
      ...DEFAULT_PROFILE.personal,
      ...(stored.personal || {}),
    },
  }
}

/**
 * Save user profile updates.
 */
export async function updateUserProfile(updates) {
  const current = await loadUserProfile()
  const updated = {
    ...current,
    ...updates,
    personal: {
      ...current.personal,
      ...(updates.personal || {}),
    },
    updatedAt: Date.now(),
  }
  await saveStoredProfile(updated)
  return updated
}
