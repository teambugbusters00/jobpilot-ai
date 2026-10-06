/**
 * options.js — JobPilot AI options page
 * Handles: LLM config, Privacy & Automation mode, Candidate Profile, Task management, History viewer
 */

import { PROVIDERS } from './agent/llm.js'
import { SYSTEM_PROMPT } from './agent/tools.js'
import { loadUserProfile, updateUserProfile } from './profile/profile.js'
import {
  getTasks, saveTask, deleteTask, createTaskId,
  getHistory, clearHistory as clearHistoryStore, deleteHistory,
} from './agent/scheduler.js'

// ─── Tab navigation ────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active')

    if (btn.dataset.tab === 'history') renderHistory()
    if (btn.dataset.tab === 'tasks') { renderTasks(); refreshActiveRuns() }
    if (btn.dataset.tab === 'profile') loadCandidateProfile()
  })
})

// ─── Status helpers ────────────────────────────────────────────────────────────

function setStatus(elId, kind, text) {
  const el = document.getElementById(elId)
  if (!el) return
  const dotClass = { ok: 'dot-ok', error: 'dot-error', warn: 'dot-warn', idle: 'dot-idle' }[kind] || 'dot-idle'
  el.innerHTML = `<span class="dot ${dotClass}"></span><span>${text}</span>`
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function openChat(params = {}) {
  const qs = new URLSearchParams(params).toString()
  chrome.tabs.create({ url: chrome.runtime.getURL(`chat.html${qs ? '?' + qs : ''}`), active: true })
}

// ─── Quick Run ─────────────────────────────────────────────────────────────────

document.getElementById('quick-run-btn')?.addEventListener('click', () => {
  openChat()
})

// ─── Settings tab ──────────────────────────────────────────────────────────────

const providerSelect       = document.getElementById('llm-provider')
const baseUrlInput         = document.getElementById('llm-base-url')
const modelInput           = document.getElementById('llm-model')
const apiKeyInput          = document.getElementById('llm-api-key')
const maxToolCallsInput    = document.getElementById('llm-max-tool-calls')
const contextLengthInput   = document.getElementById('llm-context-length')
const automationModeSelect = document.getElementById('automation-mode-select')
const privacyModeSelect    = document.getElementById('privacy-mode-select')

providerSelect?.addEventListener('change', () => {
  const p = PROVIDERS[providerSelect.value]
  if (p) {
    baseUrlInput.value = p.baseUrl
    modelInput.value   = p.defaultModel
    if (!p.requiresKey) apiKeyInput.value = ''
  }
})

async function loadLLMSettings() {
  const data = await chrome.storage.local.get([
    'llmProvider', 'llmBaseUrl', 'llmApiKey', 'llmModel',
    'maxToolCalls', 'llmContextLength', 'automationMode', 'privacyMode'
  ])

  if (providerSelect) {
    providerSelect.value = data.llmProvider || 'groq'
    const p = PROVIDERS[providerSelect.value] || PROVIDERS.groq
    baseUrlInput.value = data.llmBaseUrl || p.baseUrl
    modelInput.value   = data.llmModel   || p.defaultModel
    apiKeyInput.value  = data.llmApiKey  || ''
    maxToolCallsInput.value  = data.maxToolCalls !== undefined ? data.maxToolCalls : 50
    contextLengthInput.value = data.llmContextLength !== undefined ? data.llmContextLength : 128000
  }

  if (automationModeSelect) {
    automationModeSelect.value = data.automationMode || 'ASSISTED'
  }
  if (privacyModeSelect) {
    privacyModeSelect.value = data.privacyMode || 'cloud'
  }
}

document.getElementById('save-llm-btn')?.addEventListener('click', async () => {
  await chrome.storage.local.set({
    llmProvider:      providerSelect.value,
    llmBaseUrl:       baseUrlInput.value.trim(),
    llmApiKey:        apiKeyInput.value.trim(),
    llmModel:         modelInput.value.trim(),
    maxToolCalls:     parseInt(maxToolCallsInput.value, 10) || 0,
    llmContextLength: parseInt(contextLengthInput.value, 10) || 128000,
    automationMode:   automationModeSelect ? automationModeSelect.value : 'ASSISTED',
    privacyMode:      privacyModeSelect ? privacyModeSelect.value : 'cloud',
  })
  setStatus('llm-status', 'ok', 'Settings saved')
})

document.getElementById('test-llm-btn')?.addEventListener('click', async () => {
  setStatus('llm-status', 'idle', 'Testing…')
  const baseUrl = baseUrlInput.value.trim().replace(/\/$/, '')
  const apiKey  = apiKeyInput.value.trim()
  const model   = modelInput.value.trim()

  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with: ok' }],
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`)
    }
    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content || '(no content)'
    setStatus('llm-status', 'ok', `Connected — model replied: "${reply.slice(0, 60)}"`)
  } catch (err) {
    setStatus('llm-status', 'error', `Failed: ${err.message.slice(0, 120)}`)
  }
})

// ─── Candidate Profile tab ────────────────────────────────────────────────────

async function loadCandidateProfile() {
  const profile = await loadUserProfile()
  const p = profile.personal || {}
  document.getElementById('opt-prof-name').value     = p.name || ''
  document.getElementById('opt-prof-email').value    = p.email || ''
  document.getElementById('opt-prof-phone').value    = p.phone || ''
  document.getElementById('opt-prof-location').value = p.location || ''
  document.getElementById('opt-prof-linkedin').value = p.linkedin || ''
  document.getElementById('opt-prof-github').value   = p.github || ''
  document.getElementById('opt-prof-portfolio').value= p.portfolio || ''
  document.getElementById('opt-prof-role').value     = profile.currentRole || ''
  document.getElementById('opt-prof-workauth').value = profile.workAuthorization || ''
  document.getElementById('opt-prof-remote').value   = profile.remotePreference || 'Any'
  document.getElementById('opt-prof-gradyear').value = profile.graduationYear || ''
}

document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
  const updates = {
    personal: {
      name: document.getElementById('opt-prof-name').value.trim(),
      email: document.getElementById('opt-prof-email').value.trim(),
      phone: document.getElementById('opt-prof-phone').value.trim(),
      location: document.getElementById('opt-prof-location').value.trim(),
      linkedin: document.getElementById('opt-prof-linkedin').value.trim(),
      github: document.getElementById('opt-prof-github').value.trim(),
      portfolio: document.getElementById('opt-prof-portfolio').value.trim(),
    },
    currentRole: document.getElementById('opt-prof-role').value.trim(),
    workAuthorization: document.getElementById('opt-prof-workauth').value.trim(),
    remotePreference: document.getElementById('opt-prof-remote').value,
    graduationYear: document.getElementById('opt-prof-gradyear').value.trim(),
  }
  await updateUserProfile(updates)
  setStatus('profile-status', 'ok', 'Profile saved successfully')
})

// ─── Tab Timeout & System Prompt ──────────────────────────────────────────────

async function loadTabTimeout() {
  const data = await chrome.storage.local.get(['tabTimeoutMinutes'])
  document.getElementById('tab-timeout').value = data.tabTimeoutMinutes || 1
}

document.getElementById('save-tab-timeout-btn')?.addEventListener('click', async () => {
  const val = parseInt(document.getElementById('tab-timeout').value, 10) || 1
  await chrome.storage.local.set({ tabTimeoutMinutes: Math.max(1, Math.min(val, 60)) })
  setStatus('tab-timeout-status', 'ok', 'Saved')
})

async function loadSystemPrompt() {
  const data = await chrome.storage.local.get(['customSystemPrompt'])
  document.getElementById('system-prompt').value = data.customSystemPrompt || ''
}

document.getElementById('save-system-prompt-btn')?.addEventListener('click', async () => {
  await chrome.storage.local.set({ customSystemPrompt: document.getElementById('system-prompt').value.trim() })
  setStatus('system-prompt-status', 'ok', 'Saved')
})

document.getElementById('reset-system-prompt-btn')?.addEventListener('click', async () => {
  document.getElementById('system-prompt').value = SYSTEM_PROMPT
  await chrome.storage.local.remove(['customSystemPrompt'])
  setStatus('system-prompt-status', 'ok', 'Reset to JobPilot AI default')
})

// ─── Task Management ──────────────────────────────────────────────────────────

async function renderTasks() {
  const tasks = await getTasks()
  const list = document.getElementById('task-list')
  const empty = document.getElementById('tasks-empty')

  if (!tasks.length) {
    if (empty) empty.style.display = 'block'
    list.innerHTML = ''
    return
  }

  if (empty) empty.style.display = 'none'
  list.innerHTML = tasks.map(t => `
    <div class="task-item">
      <div class="task-header">
        <div>
          <span class="task-name">${escHtml(t.name)}</span>
          <span class="badge ${t.enabled ? 'badge-enabled' : 'badge-disabled'}">${t.enabled ? 'Active' : 'Disabled'}</span>
        </div>
        <div class="task-actions">
          <button class="btn btn-secondary btn-sm btn-run-task" data-id="${escHtml(t.id)}">▶ Run</button>
          <button class="btn btn-secondary btn-sm btn-toggle-task" data-id="${escHtml(t.id)}">${t.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-danger btn-sm btn-delete-task" data-id="${escHtml(t.id)}">Delete</button>
        </div>
      </div>
      <div class="task-meta">Interval: ${t.intervalMinutes > 0 ? `${t.intervalMinutes} min` : 'Manual'}</div>
      <div class="task-prompt">${escHtml(t.prompt)}</div>
    </div>
  `).join('')

  list.querySelectorAll('.btn-run-task').forEach(btn => {
    btn.addEventListener('click', () => openChat({ taskId: btn.dataset.id, autorun: 1 }))
  })

  list.querySelectorAll('.btn-toggle-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      const task = tasks.find(t => t.id === btn.dataset.id)
      if (task) {
        task.enabled = !task.enabled
        await saveTask(task)
        renderTasks()
      }
    })
  })

  list.querySelectorAll('.btn-delete-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteTask(btn.dataset.id)
      renderTasks()
    })
  })
}

document.getElementById('add-task-btn')?.addEventListener('click', async () => {
  const name = document.getElementById('new-task-name').value.trim()
  const interval = parseInt(document.getElementById('new-task-interval').value, 10) || 0
  const prompt = document.getElementById('new-task-prompt').value.trim()

  if (!name || !prompt) {
    setStatus('add-task-status', 'error', 'Name and prompt are required')
    return
  }

  await saveTask({
    id: createTaskId(),
    name,
    intervalMinutes: interval,
    prompt,
    enabled: true,
    createdAt: Date.now(),
  })

  document.getElementById('new-task-name').value = ''
  document.getElementById('new-task-prompt').value = ''
  setStatus('add-task-status', 'ok', 'Task added')
  renderTasks()
})

// ─── History Tab ──────────────────────────────────────────────────────────────

async function renderHistory() {
  const history = await getHistory()
  const list = document.getElementById('history-list')
  const empty = document.getElementById('history-empty')

  if (!history.length) {
    if (empty) empty.style.display = 'block'
    list.innerHTML = ''
    return
  }

  if (empty) empty.style.display = 'none'
  list.innerHTML = history.map(h => `
    <div class="history-item">
      <div class="history-header">
        <span class="history-title">${escHtml(h.taskName || 'Ad-hoc run')}</span>
        <span class="history-time">${new Date(h.startedAt).toLocaleString()}</span>
      </div>
      <div class="history-result">${escHtml(h.result || '(No output)')}</div>
      <div style="margin-top:6px;display:flex;gap:6px">
        <button class="btn btn-secondary btn-sm btn-view-chat" data-sessionid="${escHtml(h.sessionId || h.id)}">View Chat</button>
        <button class="btn btn-danger btn-sm btn-delete-history" data-id="${escHtml(h.id || h.sessionId)}">Delete</button>
      </div>
    </div>
  `).join('')

  list.querySelectorAll('.btn-view-chat').forEach(btn => {
    btn.addEventListener('click', () => openChat({ historyId: btn.dataset.sessionid }))
  })

  list.querySelectorAll('.btn-delete-history').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteHistory(btn.dataset.id)
      renderHistory()
    })
  })
}

document.getElementById('clear-history-btn')?.addEventListener('click', async () => {
  await clearHistoryStore()
  renderHistory()
})

// ─── Active runs indicator ─────────────────────────────────────────────────────

async function refreshActiveRuns() {
  chrome.runtime.sendMessage({ type: 'list_runs' }, (resp) => {
    const runs = resp?.runs || []
    const card = document.getElementById('active-runs-card')
    const list = document.getElementById('active-runs-list')
    if (!card || !list) return

    const activeRuns = runs.filter(r => r.status === 'running')
    if (activeRuns.length === 0) {
      card.style.display = 'none'
      return
    }

    card.style.display = 'block'
    list.innerHTML = activeRuns.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:13px;font-weight:600">${escHtml(r.taskName || 'Run')}</div>
          <div style="font-size:11px;color:var(--muted)">${escHtml((r.prompt || '').slice(0, 80))}</div>
        </div>
        <button class="btn btn-secondary btn-sm btn-view-active" data-sessionid="${escHtml(r.sessionId || r.runId)}">View</button>
      </div>
    `).join('')

    list.querySelectorAll('.btn-view-active').forEach(btn => {
      btn.addEventListener('click', () => openChat({ sessionId: btn.dataset.sessionid }))
    })
  })
}

// ─── Init ──────────────────────────────────────────────────────────────────────

;(async () => {
  await loadLLMSettings()
  await loadTabTimeout()
  await loadSystemPrompt()
  await loadCandidateProfile()
  await renderTasks()
})()
