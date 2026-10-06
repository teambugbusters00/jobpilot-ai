/**
 * agent/tools.js
 * Browser-native tool implementations + schemas for JobPilot AI.
 * Handles both agent-managed tabs and the user's CURRENT ACTIVE TAB.
 */

import { getStoredResume, getStoredProfile } from '../resume/resume.js'
import { loadUserProfile } from '../profile/profile.js'
import { resolveAdapter } from '../application/adapters/index.js'
import { fillField, uploadResumeToFileField } from '../application/form-filler.js'
import { generateQuestionAnswer, generateCoverLetter, tailorResumeContent } from '../application/screening.js'
import { calculateJobFit } from '../job/job-fit.js'
import { saveApplicationRecord, getApplicationsHistory, APPLICATION_STATUS } from '../application/application-state.js'

// ─── Tab registry (shared with background.js via setTabRegistry) ─────────────

/** @type {Map<number, object>} */
let _managedTabs = null
/** @type {Function} */
let _attachDebugger = null
/** @type {Function} */
let _closeTab = null

export function setTabRegistry(managedTabs, attachDebugger, closeTab) {
  _managedTabs = managedTabs
  _attachDebugger = attachDebugger
  _closeTab = closeTab
}

// ─── Browser primitives ───────────────────────────────────────────────────────

export async function toolCreateTab({ url = 'about:blank', active = false, meta = {} } = {}) {
  const chromeTab = await chrome.tabs.create({ url, active: !!active })
  if (!chromeTab.id) throw new Error('Failed to create tab: no tabId returned')

  const tabId = chromeTab.id
  await new Promise(r => setTimeout(r, 500))

  const targetId = await _attachDebugger(tabId)

  const tabInfo = {
    tabId,
    targetId,
    url,
    title: chromeTab.title || '',
    meta: meta || {},
    isAttached: true,
    lastActivity: Date.now(),
    createdAt: Date.now(),
  }
  _managedTabs.set(tabId, tabInfo)

  console.log(`[JobPilot] Created tab ${tabId} url=${url}`)
  return { tabId, url, title: tabInfo.title, meta: tabInfo.meta }
}

export async function toolListTabs() {
  return Array.from(_managedTabs.values()).map(t => ({
    tabId: t.tabId, url: t.url, title: t.title, meta: t.meta,
    isAttached: t.isAttached, lastActivity: t.lastActivity,
  }))
}

export async function toolGetTab({ tab_id } = {}) {
  const id = Number(tab_id)
  const tab = _managedTabs.get(id)
  if (!tab) throw new Error(`Tab ${id} not found`)
  return { tabId: tab.tabId, url: tab.url, title: tab.title, meta: tab.meta, isAttached: tab.isAttached }
}

export async function toolCloseTab({ tab_id } = {}) {
  const id = Number(tab_id)
  if (!_managedTabs.has(id)) throw new Error(`Tab ${id} not found`)
  await _closeTab(id, 'agent')
  return { success: true, tabId: id }
}

export async function toolNavigate({ tab_id, url, wait_for_load = true, timeout_seconds = 30 } = {}) {
  const id = Number(tab_id)
  const tab = _managedTabs.get(id)
  if (!tab) throw new Error(`Tab ${id} not found`)

  if (!tab.isAttached) {
    await _attachDebugger(id)
    tab.isAttached = true
  }

  tab.lastActivity = Date.now()
  await chrome.debugger.sendCommand({ tabId: id }, 'Page.navigate', { url })

  if (wait_for_load) {
    await waitForPageLoad(id, timeout_seconds * 1000)
  }

  const info = await chrome.tabs.get(id).catch(() => null)
  if (info) { tab.url = info.url || url; tab.title = info.title || '' }
  tab.lastActivity = Date.now()

  return { tabId: id, url: tab.url, title: tab.title }
}

async function waitForPageLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const check = async () => {
      if (Date.now() > deadline) { resolve(); return }
      try {
        const result = await chrome.debugger.sendCommand(
          { tabId }, 'Runtime.evaluate',
          { expression: 'document.readyState', returnByValue: true }
        )
        if (result?.result?.value === 'complete') { resolve(); return }
      } catch {}
      setTimeout(check, 300)
    }
    setTimeout(check, 300)
  })
}

export async function toolEval({ tab_id, expression, await_promise = false, timeout_seconds = 30 } = {}) {
  const id = Number(tab_id)
  const tab = _managedTabs.get(id)
  if (!tab) throw new Error(`Tab ${id} not found`)

  if (!tab.isAttached) {
    await _attachDebugger(id)
    tab.isAttached = true
  }

  tab.lastActivity = Date.now()

  const result = await chrome.debugger.sendCommand({ tabId: id }, 'Runtime.evaluate', {
    expression,
    awaitPromise: !!await_promise,
    returnByValue: true,
    timeout: timeout_seconds * 1000,
  })

  if (result?.exceptionDetails) {
    throw new Error(`JS Error: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`)
  }

  return result?.result?.value ?? null
}

export async function toolScreenshot({ tab_id, format = 'png', quality = 80 } = {}) {
  const id = Number(tab_id)
  const tab = _managedTabs.get(id)
  if (!tab) throw new Error(`Tab ${id} not found`)

  if (!tab.isAttached) {
    await _attachDebugger(id)
    tab.isAttached = true
  }

  tab.lastActivity = Date.now()

  const params = { format: format === 'jpeg' ? 'jpeg' : 'png' }
  if (format === 'jpeg') params.quality = quality

  const result = await chrome.debugger.sendCommand({ tabId: id }, 'Page.captureScreenshot', params)
  const dataUrl = `data:image/${params.format};base64,${result.data}`

  return { dataUrl, format: params.format, tabId: id }
}

export async function toolCdp({ tab_id, method, params = {}, timeout = 30 } = {}) {
  const id = Number(tab_id)
  const tab = _managedTabs.get(id)
  if (!tab) throw new Error(`Tab ${id} not found`)

  if (!tab.isAttached) {
    await _attachDebugger(id)
    tab.isAttached = true
  }

  tab.lastActivity = Date.now()
  const result = await chrome.debugger.sendCommand({ tabId: id }, method, params || {})
  return result || {}
}

export async function toolSleep({ seconds = 1 } = {}) {
  const ms = Math.max(0, Math.min(seconds, 300)) * 1000
  await new Promise(r => setTimeout(r, ms))
  return { slept_seconds: ms / 1000 }
}

export async function toolFetch({ url, method = 'GET', headers = {}, body = null, timeout_seconds = 30 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout_seconds * 1000)

  try {
    const opts = {
      method: method.toUpperCase(),
      headers: headers || {},
      signal: ctrl.signal,
    }
    if (body !== null && body !== undefined) {
      opts.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const res = await fetch(url, opts)
    const contentType = res.headers.get('content-type') || ''
    let responseBody
    if (contentType.includes('application/json')) {
      responseBody = await res.json()
    } else {
      responseBody = await res.text()
    }

    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: responseBody,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Active User Tab Support ───────────────────────────────────────────────────

/**
 * Find the user's active tab in the current window.
 */
export async function toolGetActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tabs.length || !tabs[0].id) {
    // Try any active tab across windows
    const allActive = await chrome.tabs.query({ active: true })
    if (allActive.length && allActive[0].id) {
      return { tabId: allActive[0].id, url: allActive[0].url || '', title: allActive[0].title || '' }
    }
    throw new Error('No active browser tab found.')
  }
  const t = tabs[0]
  return { tabId: t.id, url: t.url || '', title: t.title || '' }
}

/**
 * Attach debugger to current user tab and register in managedTabs with meta.keepOpen = true.
 */
export async function toolAttachCurrentTab({ tab_id } = {}) {
  let targetTabId = tab_id ? Number(tab_id) : null
  if (!targetTabId) {
    const active = await toolGetActiveTab()
    targetTabId = active.tabId
  }

  const chromeTab = await chrome.tabs.get(targetTabId)
  if (!chromeTab) throw new Error(`Tab ${targetTabId} not found`)

  let tabInfo = _managedTabs.get(targetTabId)
  if (!tabInfo) {
    const targetId = await _attachDebugger(targetTabId)
    tabInfo = {
      tabId: targetTabId,
      targetId,
      url: chromeTab.url || '',
      title: chromeTab.title || '',
      meta: { keepOpen: true, userOwned: true }, // The timeout cleaner MUST NOT close this tab!
      isAttached: true,
      lastActivity: Date.now(),
      createdAt: Date.now(),
    }
    _managedTabs.set(targetTabId, tabInfo)
  } else {
    tabInfo.meta = { ...(tabInfo.meta || {}), keepOpen: true }
    if (!tabInfo.isAttached) {
      await _attachDebugger(targetTabId)
      tabInfo.isAttached = true
    }
  }

  console.log(`[JobPilot] Attached to user tab ${targetTabId} (keepOpen=true)`)
  return {
    success: true,
    tabId: targetTabId,
    url: tabInfo.url,
    title: tabInfo.title,
    keepOpen: true,
  }
}

// ─── Resume & Profile Tools ───────────────────────────────────────────────────

export async function toolGetResume() {
  const resume = await getStoredResume()
  if (!resume || !resume.text) {
    return {
      available: false,
      message: 'No resume uploaded. Please upload a resume in the JobPilot AI side panel.',
    }
  }
  return {
    available: true,
    fileName: resume.fileName,
    mimeType: resume.mimeType,
    text: resume.text,
    uploadedAt: resume.uploadedAt,
  }
}

export async function toolGetProfile() {
  const profile = await loadUserProfile()
  return {
    profile,
  }
}

// ─── Job Analysis & Application Tools ─────────────────────────────────────────

export async function toolAnalyzeCurrentJob({ tab_id } = {}) {
  let id = tab_id ? Number(tab_id) : null
  if (!id) {
    const active = await toolGetActiveTab()
    id = active.tabId
  }

  // Ensure tab is attached
  await toolAttachCurrentTab({ tab_id: id })

  const tab = await chrome.tabs.get(id)
  const adapter = resolveAdapter(tab.url || '')
  console.log(`[JobPilot] Analyzing job using adapter "${adapter.name}" on tab ${id}`)

  const jobData = await adapter.extractJob(id)

  // Calculate job fit if resume exists
  const resume = await getStoredResume()
  const profile = await loadUserProfile()
  let fitEstimate = null
  if (resume?.text) {
    fitEstimate = calculateJobFit(jobData, resume, profile)
  }

  // Save discovered application
  await saveApplicationRecord({
    jobTitle: jobData.title,
    company: jobData.company,
    jobUrl: tab.url,
    fitScore: fitEstimate?.overallScore || 0,
    status: APPLICATION_STATUS.ANALYZED,
  })

  return {
    job: jobData,
    fitEstimate,
    tabId: id,
  }
}

export async function toolAnalyzeCurrentApplication({ tab_id } = {}) {
  let id = tab_id ? Number(tab_id) : null
  if (!id) {
    const active = await toolGetActiveTab()
    id = active.tabId
  }

  await toolAttachCurrentTab({ tab_id: id })

  const tab = await chrome.tabs.get(id)
  const adapter = resolveAdapter(tab.url || '')
  const formInfo = await adapter.extractForm(id)

  return {
    ...formInfo,
    tabId: id,
  }
}

export async function toolFillApplicationField({ tab_id, field, value } = {}) {
  let id = tab_id ? Number(tab_id) : null
  if (!id) {
    const active = await toolGetActiveTab()
    id = active.tabId
  }

  if (!field) throw new Error('Field specification required')
  return await fillField(id, field, value)
}

export async function toolFillApplication({ tab_id } = {}) {
  let id = tab_id ? Number(tab_id) : null
  if (!id) {
    const active = await toolGetActiveTab()
    id = active.tabId
  }

  await toolAttachCurrentTab({ tab_id: id })
  const { fields } = await toolAnalyzeCurrentApplication({ tab_id: id })
  const resume = await getStoredResume()
  const profile = await loadUserProfile()

  const results = []
  const requiresReview = []

  const personal = profile?.personal || {}

  for (const field of fields) {
    if (field.isHighRisk) {
      requiresReview.push({
        field,
        reason: 'High-risk question requiring explicit user confirmation.',
      })
      continue
    }

    let valueToFill = null

    switch (field.semanticType) {
      case 'first_name':
        valueToFill = personal.name ? personal.name.split(' ')[0] : null
        break
      case 'last_name':
        valueToFill = personal.name ? personal.name.split(' ').slice(1).join(' ') : null
        break
      case 'full_name':
        valueToFill = personal.name || null
        break
      case 'email':
        valueToFill = personal.email || null
        break
      case 'phone':
        valueToFill = personal.phone || null
        break
      case 'linkedin':
        valueToFill = personal.linkedin || null
        break
      case 'github':
        valueToFill = personal.github || null
        break
      case 'portfolio':
        valueToFill = personal.portfolio || null
        break
      case 'location':
        valueToFill = personal.location || null
        break
      case 'resume_upload':
        if (resume) {
          const upRes = await uploadResumeToFileField(id, field, resume)
          results.push({ field: field.label || field.name, success: upRes.success, note: upRes.message })
          continue
        }
        break
    }

    if (valueToFill !== null && valueToFill !== undefined && valueToFill !== '') {
      const fillRes = await fillField(id, field, valueToFill)
      results.push({
        field: field.label || field.name,
        filledValue: valueToFill,
        verified: fillRes.success,
      })
    } else if (field.required && !field.currentValue) {
      requiresReview.push({
        field,
        reason: 'Required field without verified profile data.',
      })
    }
  }

  return {
    tabId: id,
    filledCount: results.length,
    results,
    requiresReview,
    status: requiresReview.length > 0 ? APPLICATION_STATUS.REVIEW_REQUIRED : APPLICATION_STATUS.FILLED,
  }
}

export async function toolUploadResume({ tab_id } = {}) {
  let id = tab_id ? Number(tab_id) : null
  if (!id) {
    const active = await toolGetActiveTab()
    id = active.tabId
  }

  const resume = await getStoredResume()
  if (!resume) {
    return { success: false, error: 'No resume uploaded in JobPilot AI.' }
  }

  const { fields } = await toolAnalyzeCurrentApplication({ tab_id: id })
  const fileField = fields.find(f => f.type === 'file' || f.semanticType === 'resume_upload')

  if (!fileField) {
    return { success: false, error: 'No resume file input detected on this page.' }
  }

  return await uploadResumeToFileField(id, fileField, resume)
}

export async function toolGenerateAnswer({ question, tab_id } = {}) {
  let id = tab_id ? Number(tab_id) : null
  if (!id) {
    const active = await toolGetActiveTab().catch(() => null)
    id = active?.tabId
  }

  let job = null
  if (id) {
    job = await toolAnalyzeCurrentJob({ tab_id: id }).then(r => r.job).catch(() => null)
  }
  const resume = await getStoredResume()
  const profile = await loadUserProfile()

  return await generateQuestionAnswer(question, { job, resume, profile })
}

export async function toolGenerateCoverLetter({ tab_id } = {}) {
  let id = tab_id ? Number(tab_id) : null
  if (!id) {
    const active = await toolGetActiveTab().catch(() => null)
    id = active?.tabId
  }

  let job = null
  if (id) {
    job = await toolAnalyzeCurrentJob({ tab_id: id }).then(r => r.job).catch(() => null)
  }
  const resume = await getStoredResume()
  const profile = await loadUserProfile()

  const coverLetter = await generateCoverLetter({ job, resume, profile })
  return { coverLetter }
}

export async function toolTailorResume({ tab_id } = {}) {
  let id = tab_id ? Number(tab_id) : null
  if (!id) {
    const active = await toolGetActiveTab().catch(() => null)
    id = active?.tabId
  }

  let job = null
  if (id) {
    job = await toolAnalyzeCurrentJob({ tab_id: id }).then(r => r.job).catch(() => null)
  }
  const resume = await getStoredResume()
  const profile = await loadUserProfile()

  return await tailorResumeContent({ job, resume, profile })
}

export async function toolGetApplicationState() {
  const history = await getApplicationsHistory()
  return {
    applications: history,
    count: history.length,
  }
}

export async function toolSaveApplication({ application } = {}) {
  if (!application) throw new Error('Application object required')
  return await saveApplicationRecord(application)
}

export async function toolAskUserConfirmation({ question, category = 'high_risk' } = {}) {
  return {
    needsConfirmation: true,
    question,
    category,
    message: `[ACTION PAUSED] High-risk or uncertain question: "${question}". Awaiting human confirmation.`,
  }
}

// ─── Tool Registry ────────────────────────────────────────────────────────────

export const TOOL_FUNCTIONS = {
  // Browser primitives
  create_tab:                  toolCreateTab,
  list_tabs:                   toolListTabs,
  get_tab:                     toolGetTab,
  close_tab:                   toolCloseTab,
  navigate:                    toolNavigate,
  eval:                        toolEval,
  screenshot:                  toolScreenshot,
  cdp:                         toolCdp,
  fetch:                       toolFetch,
  sleep:                       toolSleep,

  // JobPilot AI specific
  get_active_tab:              toolGetActiveTab,
  attach_current_tab:          toolAttachCurrentTab,
  get_resume:                  toolGetResume,
  get_profile:                 toolGetProfile,
  analyze_current_job:         toolAnalyzeCurrentJob,
  analyze_current_application: toolAnalyzeCurrentApplication,
  fill_application_field:      toolFillApplicationField,
  fill_application:            toolFillApplication,
  upload_resume:               toolUploadResume,
  generate_answer:             toolGenerateAnswer,
  generate_cover_letter:       toolGenerateCoverLetter,
  tailor_resume:               toolTailorResume,
  get_application_state:       toolGetApplicationState,
  save_application:            toolSaveApplication,
  ask_user_confirmation:       toolAskUserConfirmation,
}

export const TOOL_SCHEMAS = [
  // Existing tools
  {
    type: 'function',
    function: {
      name: 'create_tab',
      description: 'Create a new Chrome tab (background, not active). Returns tabId.',
      parameters: {
        type: 'object',
        properties: {
          url:    { type: 'string',  description: 'URL to open (default: about:blank)' },
          active: { type: 'boolean', description: 'Bring tab to foreground (default: false)' },
          meta:   { type: 'object',  description: 'Optional metadata' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tabs',
      description: 'List all agent-managed Chrome tabs.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tab',
      description: 'Get info about a specific tab.',
      parameters: {
        type: 'object',
        required: ['tab_id'],
        properties: { tab_id: { type: 'integer', description: 'Tab ID' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_tab',
      description: 'Close an agent-opened Chrome tab.',
      parameters: {
        type: 'object',
        required: ['tab_id'],
        properties: { tab_id: { type: 'integer', description: 'Tab ID to close' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigate a tab to a URL and wait for page load.',
      parameters: {
        type: 'object',
        required: ['tab_id', 'url'],
        properties: {
          tab_id:          { type: 'integer', description: 'Tab ID' },
          url:             { type: 'string',  description: 'URL to navigate to' },
          wait_for_load:   { type: 'boolean', description: 'Wait for document.readyState=complete (default: true)' },
          timeout_seconds: { type: 'integer', description: 'Timeout in seconds (default: 30)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'eval',
      description: 'Execute JavaScript in a Chrome tab and return the result.',
      parameters: {
        type: 'object',
        required: ['tab_id', 'expression'],
        properties: {
          tab_id:          { type: 'integer', description: 'Tab ID' },
          expression:      { type: 'string',  description: 'JavaScript expression to evaluate' },
          await_promise:   { type: 'boolean', description: 'Await returned Promise (default: false)' },
          timeout_seconds: { type: 'integer', description: 'Timeout in seconds (default: 30)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: 'Capture a screenshot of a tab. Returns dataUrl.',
      parameters: {
        type: 'object',
        required: ['tab_id'],
        properties: {
          tab_id:  { type: 'integer', description: 'Tab ID' },
          format:  { type: 'string',  description: 'png or jpeg' },
          quality: { type: 'integer', description: 'JPEG quality 1-100' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cdp',
      description: 'Send raw Chrome DevTools Protocol command.',
      parameters: {
        type: 'object',
        required: ['tab_id', 'method'],
        properties: {
          tab_id:  { type: 'integer', description: 'Tab ID' },
          method:  { type: 'string',  description: 'CDP method name' },
          params:  { type: 'object',  description: 'CDP method parameters' },
          timeout: { type: 'integer', description: 'Timeout in seconds' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch',
      description: 'Make an arbitrary HTTP request without CORS restrictions.',
      parameters: {
        type: 'object',
        required: ['url'],
        properties: {
          url:             { type: 'string' },
          method:          { type: 'string' },
          headers:         { type: 'object' },
          body:            { description: 'Request body' },
          timeout_seconds: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sleep',
      description: 'Wait for a specified number of seconds.',
      parameters: {
        type: 'object',
        properties: { seconds: { type: 'number', description: 'Seconds to sleep' } },
      },
    },
  },

  // JobPilot AI tools
  {
    type: 'function',
    function: {
      name: 'get_active_tab',
      description: "Find the user's current active browser tab (URL, title, and tabId).",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'attach_current_tab',
      description: "Safely attach to the user's active tab so it can be inspected without being auto-closed.",
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'integer', description: 'Optional tab ID to attach to' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resume',
      description: "Retrieve the candidate's uploaded resume and text from local storage.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_profile',
      description: "Retrieve the candidate's structured profile data (contact details, verified experience, education).",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_current_job',
      description: 'Analyze the job description, title, company, requirements, and AI fit score on the active tab.',
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'integer', description: 'Optional tab ID' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_current_application',
      description: 'Detect and inspect all interactive form fields, file uploads, and requirements on the active application page.',
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'integer', description: 'Optional tab ID' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill_application_field',
      description: 'Fill a single application form field with verified candidate data and confirm the change.',
      parameters: {
        type: 'object',
        required: ['field', 'value'],
        properties: {
          tab_id: { type: 'integer' },
          field:  { type: 'object', description: 'Field object from analyze_current_application' },
          value:  { description: 'Value to fill' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill_application',
      description: 'Safely autofill all verified standard fields on the active application page, flagging any high-risk fields for human review.',
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'integer', description: 'Optional tab ID' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'upload_resume',
      description: 'Attach the stored resume file to the application form file input.',
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'integer', description: 'Optional tab ID' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_answer',
      description: 'Generate a human-like, conversational answer to a specific application or screening question based strictly on verified background.',
      parameters: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string', description: 'The question to answer' },
          tab_id:   { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_cover_letter',
      description: 'Generate a tailored, truthful cover letter for the current job.',
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'integer' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tailor_resume',
      description: 'Tailor and rephrase existing resume bullet points specifically for the active job description.',
      parameters: {
        type: 'object',
        properties: { tab_id: { type: 'integer' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_application_state',
      description: 'Retrieve stored application history and tracking status.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_application',
      description: 'Save or update an application entry in the local application tracker.',
      parameters: {
        type: 'object',
        required: ['application'],
        properties: { application: { type: 'object' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user_confirmation',
      description: 'Ask the user for explicit confirmation or input on high-risk fields (salary, visa, legal, demographic, or submission).',
      parameters: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string', description: 'Confirmation question or request' },
          category: { type: 'string', description: 'high_risk, submission, or missing_info' },
        },
      },
    },
  },
]

export const SYSTEM_PROMPT = `You are JobPilot AI — an intelligent browser copilot for smarter job applications.
You assist job seekers with job analysis, resume tailoring, fit estimation, and safe application form assistance.

============================================================
CRITICAL SAFETY & TRUTHFULNESS MANDATES (NON-NEGOTIABLE)
============================================================
1. NEVER invent or fabricate work experience, projects, skills, education, employment history, metrics, certifications, or visa status.
2. Only use facts verified in the user's uploaded resume or user profile.
3. NEVER attempt to solve or bypass CAPTCHAs, 2FA, or security controls. If a CAPTCHA appears, stop and alert the user: "CAPTCHA detected. Manual action required."
4. NEVER submit an application automatically. SUBMISSION ALWAYS REQUIRES EXPLICIT USER ACTION.
5. For HIGH-RISK QUESTIONS (salary expectations, work authorization, visa sponsorship, legal disclosures, demographics): NEVER guess. STOP AND ASK THE USER using ask_user_confirmation.
6. Tone: Natural, conversational English. Sound like a real early-career software engineer. Avoid robotic corporate filler and empty buzzwords.
7. Active Tab: You can inspect the user's active tab via get_active_tab and attach_current_tab. User-opened tabs must NEVER be closed by the agent.

Available Tools:
- get_active_tab, attach_current_tab: Work on the user's current job page
- get_resume, get_profile: Access verified candidate data
- analyze_current_job: Extract job requirements, responsibilities, and calculate AI Fit Estimate
- analyze_current_application: Detect form fields, labels, inputs, and high-risk questions
- fill_application, fill_application_field: Autofill safe fields with verified data
- upload_resume: Attach the uploaded resume to the file input
- generate_answer: Write concise, truthful answers to application questions
- generate_cover_letter: Create a natural, role-specific cover letter
- tailor_resume: Rephrase existing bullets to highlight relevance to the JD
- ask_user_confirmation: Prompt the human user for high-risk answers or review`
