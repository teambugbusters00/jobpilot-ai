/**
 * chat.js — JobPilot AI (Jobright-inspired Copilot Controller)
 */

import { getStoredResume, removeStoredResume, uploadAndStoreResume } from './resume/resume.js'
import { loadUserProfile, updateUserProfile } from './profile/profile.js'
import {
  renderJobrightHeroCard,
  renderAiToolsCards,
  renderSmartAutofillBanner,
  renderResumeCard,
  renderFitModalBody,
  escHtml,
} from './ui/components.js'
import { toolGetActiveTab, toolAttachCurrentTab } from './agent/tools.js'
import { analyzeJobPage } from './job/job-analyzer.js'
import { calculateJobFit } from './job/job-fit.js'
import { analyzeApplicationForm } from './application/form-analyzer.js'
import { fillField, uploadResumeToFileField } from './application/form-filler.js'
import {
  tailorResumeContent,
  generateCoverLetter,
  generateReferralOutreach,
  generateInterviewQuestions,
  generateCompanyInsights,
} from './application/screening.js'
import {
  getApplicationsHistory,
  saveApplicationRecord,
  updateApplicationStatus,
  APPLICATION_STATUS,
} from './application/application-state.js'

// ─── DOM References ───────────────────────────────────────────────────────────

const heroCardContainer    = document.getElementById('hero-card-container')
const aiToolsContainer     = document.getElementById('ai-tools-container')
const smartAutofillContainer = document.getElementById('smart-autofill-container')
const resumeContainer      = document.getElementById('resume-container')
const trackerListContainer = document.getElementById('tracker-list-container')
const trackerCountEl       = document.getElementById('tracker-count')
const trackerBadgeTotal    = document.getElementById('tracker-badge-total')
const modeLabel            = document.getElementById('mode-label')
const btnModeToggle        = document.getElementById('btn-mode-toggle')

// Modals
const modalCustomizeResume = document.getElementById('modal-customize-resume')
const bodyCustomizeResume  = document.getElementById('body-customize-resume')
const modalCoverLetter     = document.getElementById('modal-cover-letter')
const bodyCoverLetter      = document.getElementById('body-cover-letter')
const modalFitAnalysis     = document.getElementById('modal-fit-analysis')
const bodyFitAnalysis      = document.getElementById('body-fit-analysis')
const modalInsiderReferral = document.getElementById('modal-insider-referral')
const bodyInsiderReferral  = document.getElementById('body-insider-referral')
const modalInterviewPrep   = document.getElementById('modal-interview-prep')
const bodyInterviewPrep    = document.getElementById('body-interview-prep')
const btnCopyInterviewQa   = document.getElementById('btn-copy-interview-qa')
const modalAutofillReview  = document.getElementById('modal-autofill-review')
const bodyAutofillReview   = document.getElementById('body-autofill-review')

// Copilot Chat
const copilotMessages      = document.getElementById('copilot-messages')
const copilotInput         = document.getElementById('copilot-input')
const btnCopilotSend       = document.getElementById('btn-copilot-send')

// ─── State ────────────────────────────────────────────────────────────────────

let currentResume       = null
let currentProfile      = null
let currentJob          = null
let currentFitEstimate  = null
let currentAppForm      = null
let filledResults       = []
let automationMode      = 'ASSISTED'
let isCurrentJobLiked    = false
let trackerCurrentFilter = 'all'
let activeSessionId     = null
let isRunningAgent      = false
let pollInterval        = null
let renderedEventCount  = 0

// ─── Navigation Tabs ──────────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-view').forEach(v => v.style.display = 'none')
    btn.classList.add('active')

    const targetView = document.getElementById(`view-${btn.dataset.tab}`)
    if (targetView) targetView.style.display = 'flex'

    if (btn.dataset.tab === 'tracker') renderTrackerView()
    if (btn.dataset.tab === 'profile') populateProfileInputs()
  })
})

// ─── Automation Mode ──────────────────────────────────────────────────────────

const MODES = ['ASSISTED', 'AUTO-SAFE', 'MANUAL']

async function initAutomationMode() {
  const data = await chrome.storage.local.get(['automationMode'])
  if (data.automationMode && MODES.includes(data.automationMode)) {
    automationMode = data.automationMode
  }
  modeLabel.textContent = automationMode
}

btnModeToggle?.addEventListener('click', async () => {
  const nextIdx = (MODES.indexOf(automationMode) + 1) % MODES.length
  automationMode = MODES[nextIdx]
  await chrome.storage.local.set({ automationMode })
  modeLabel.textContent = automationMode
})

document.getElementById('btn-open-options')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})

// ─── Job & AI Tools Load ──────────────────────────────────────────────────────

async function loadJobAndTools() {
  try {
    const activeTab = await toolGetActiveTab().catch(() => null)
    if (activeTab) {
      const jobData = await analyzeJobPage(activeTab.tabId).catch(() => null)
      if (jobData && (jobData.title || jobData.company || jobData.description)) {
        currentJob = jobData
        currentFitEstimate = calculateJobFit(currentJob, currentResume, currentProfile)
        const history = await getApplicationsHistory()
        const existing = history.find(a => (currentJob.url && a.jobUrl === currentJob.url) || (a.jobTitle === currentJob.title && a.company === currentJob.company))
        isCurrentJobLiked = Boolean(existing?.isLiked)
      }
    }
  } catch (err) {
    console.warn('[JobLoad] Could not auto-load job:', err)
  }

  // Render Job Hero Card
  renderJobrightHeroCard(heroCardContainer, currentJob, currentFitEstimate, isCurrentJobLiked)
  document.getElementById('btn-analyze-active-job')?.addEventListener('click', handleManualAnalyze)
  attachHeroCardListeners()

  // Render AI Tools Cards
  renderAiToolsCards(aiToolsContainer)
  attachAiToolsListeners()

  // Render Smart Autofill Banner
  renderSmartAutofillBanner(smartAutofillContainer, currentAppForm)
  attachAutofillBannerListeners()
}

async function handleManualAnalyze() {
  try {
    heroCardContainer.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted)">Analyzing current browser tab...</div>'
    const activeTab = await toolGetActiveTab()
    await toolAttachCurrentTab({ tab_id: activeTab.tabId })
    const jobData = await analyzeJobPage(activeTab.tabId)
    currentJob = jobData
    currentFitEstimate = calculateJobFit(currentJob, currentResume, currentProfile)

    const history = await getApplicationsHistory()
    const existing = history.find(a => (currentJob.url && a.jobUrl === currentJob.url) || (a.jobTitle === currentJob.title && a.company === currentJob.company))
    isCurrentJobLiked = Boolean(existing?.isLiked)

    renderJobrightHeroCard(heroCardContainer, currentJob, currentFitEstimate, isCurrentJobLiked)
    attachHeroCardListeners()

    // Save discovered job to tracker
    await saveApplicationRecord({
      jobTitle: currentJob.title,
      company: currentJob.company,
      jobUrl: activeTab.url,
      fitScore: currentFitEstimate?.overallScore || 0,
      status: isCurrentJobLiked ? APPLICATION_STATUS.LIKED : APPLICATION_STATUS.ANALYZED,
      isLiked: isCurrentJobLiked,
    })
    updateTrackerCount()

    // Inspect form
    currentAppForm = await analyzeApplicationForm(activeTab.tabId)
    renderSmartAutofillBanner(smartAutofillContainer, currentAppForm)
    attachAutofillBannerListeners()
  } catch (err) {
    heroCardContainer.innerHTML = `<div style="text-align:center;padding:16px;color:var(--danger)">Error: ${escHtml(err.message)}</div>`
  }
}

// ─── Hero Card Interactive Listeners ─────────────────────────────────────────

function attachHeroCardListeners() {
  if (!currentJob) return

  // 1. Like Job
  const btnLike = document.getElementById('btn-like-job')
  btnLike?.addEventListener('click', async () => {
    isCurrentJobLiked = !isCurrentJobLiked
    await saveApplicationRecord({
      jobTitle: currentJob.title,
      company: currentJob.company,
      jobUrl: currentJob.url,
      fitScore: currentFitEstimate?.overallScore || 0,
      isLiked: isCurrentJobLiked,
      status: isCurrentJobLiked ? APPLICATION_STATUS.LIKED : APPLICATION_STATUS.ANALYZED,
    })
    btnLike.innerHTML = isCurrentJobLiked ? '❤️' : '🤍'
    btnLike.title = isCurrentJobLiked ? 'Unlike job' : 'Save to Liked'
    updateTrackerCount()
  })

  // 2. Share Job Link
  document.getElementById('btn-share-job')?.addEventListener('click', () => {
    const url = currentJob.url || window.location.href
    navigator.clipboard.writeText(url)
    alert('Job posting link copied to clipboard!')
  })

  // 3. Overview vs Company Insights Tabs
  const tabOverview = document.getElementById('tab-sub-overview')
  const tabCompany = document.getElementById('tab-sub-company')
  const contentOverview = document.getElementById('content-sub-overview')
  const contentCompany = document.getElementById('content-sub-company')
  const companyInsightsText = document.getElementById('company-insights-text')

  tabOverview?.addEventListener('click', () => {
    tabOverview.classList.add('active')
    tabCompany?.classList.remove('active')
    if (contentOverview) contentOverview.style.display = '-webkit-box'
    if (contentCompany) contentCompany.style.display = 'none'
  })

  tabCompany?.addEventListener('click', async () => {
    tabCompany.classList.add('active')
    tabOverview?.classList.remove('active')
    if (contentOverview) contentOverview.style.display = 'none'
    if (contentCompany) contentCompany.style.display = 'block'

    if (companyInsightsText && companyInsightsText.dataset.loaded !== 'true') {
      companyInsightsText.innerHTML = '<span style="color:var(--brand-green)">Generating AI company insights &amp; hiring tips...</span>'
      try {
        const insights = await generateCompanyInsights({ job: currentJob })
        companyInsightsText.innerHTML = escHtml(insights).replace(/\n/g, '<br/>')
        companyInsightsText.dataset.loaded = 'true'
      } catch (err) {
        companyInsightsText.innerHTML = `<span style="color:var(--danger)">Error: ${escHtml(err.message)}</span>`
      }
    }
  })
}

// ─── AI Tools Click Handlers ──────────────────────────────────────────────────

function attachAiToolsListeners() {
  // 1. Customize Your Resume
  document.getElementById('tool-customize-resume')?.addEventListener('click', async () => {
    modalCustomizeResume.classList.add('active')
    bodyCustomizeResume.innerHTML = '<div style="text-align:center;padding:24px;color:var(--brand-green)">Generating role-tailored resume bullets...</div>'
    try {
      const tailored = await tailorResumeContent({ job: currentJob, resume: currentResume, profile: currentProfile })
      bodyCustomizeResume.innerHTML = `
        <div style="font-weight:700;font-size:12px;color:var(--brand-green);margin-bottom:6px">Tailored Bullets for ${escHtml(currentJob?.title || 'Job')}</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;background:rgba(255,255,255,0.03);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);color:#fff">${escHtml(tailored.tailoredText)}</pre>
      `
      document.getElementById('btn-copy-tailored-resume').onclick = () => {
        navigator.clipboard.writeText(tailored.tailoredText)
        alert('Tailored resume copied to clipboard!')
      }
    } catch (err) {
      bodyCustomizeResume.innerHTML = `<div style="color:var(--danger)">Failed: ${escHtml(err.message)}</div>`
    }
  })

  // 2. Build Cover Letter
  document.getElementById('tool-build-cover-letter')?.addEventListener('click', async () => {
    modalCoverLetter.classList.add('active')
    bodyCoverLetter.innerHTML = '<div style="text-align:center;padding:24px;color:var(--brand-green)">Drafting personalized cover letter...</div>'
    try {
      const coverLetter = await generateCoverLetter({ job: currentJob, resume: currentResume, profile: currentProfile })
      bodyCoverLetter.innerHTML = `
        <div style="font-weight:700;font-size:12px;color:var(--brand-green);margin-bottom:6px">Tailored Cover Letter</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;background:rgba(255,255,255,0.03);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);color:#fff">${escHtml(coverLetter)}</pre>
      `
      document.getElementById('btn-copy-cover-letter').onclick = () => {
        navigator.clipboard.writeText(coverLetter)
        alert('Cover letter copied to clipboard!')
      }
    } catch (err) {
      bodyCoverLetter.innerHTML = `<div style="color:var(--danger)">Failed: ${escHtml(err.message)}</div>`
    }
  })

  // 3. Analyze How Well You Fit
  document.getElementById('tool-analyze-fit')?.addEventListener('click', () => {
    modalFitAnalysis.classList.add('active')
    renderFitModalBody(bodyFitAnalysis, currentJob, currentFitEstimate)
  })

  // 4. Role Interview Coaching (Jobright NEW Feature)
  document.getElementById('tool-interview-prep')?.addEventListener('click', async () => {
    modalInterviewPrep.classList.add('active')
    bodyInterviewPrep.innerHTML = '<div style="text-align:center;padding:24px;color:var(--warning)">Generating role-specific interview coaching questions &amp; talking points...</div>'
    try {
      const qa = await generateInterviewQuestions({ job: currentJob, resume: currentResume, profile: currentProfile })
      bodyInterviewPrep.innerHTML = `
        <div style="font-weight:700;font-size:12px;color:var(--warning);margin-bottom:8px">Role Interview Questions &amp; Concept Talking Points</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;background:rgba(255,255,255,0.03);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);color:#fff;line-height:1.5">${escHtml(qa)}</pre>
      `
      btnCopyInterviewQa.onclick = () => {
        navigator.clipboard.writeText(qa)
        alert('Interview Q&A copied to clipboard!')
      }
    } catch (err) {
      bodyInterviewPrep.innerHTML = `<div style="color:var(--danger)">Failed: ${escHtml(err.message)}</div>`
    }
  })

  // 5. Insider Connection & Referral
  document.getElementById('tool-insider-connection')?.addEventListener('click', async () => {
    modalInsiderReferral.classList.add('active')
    bodyInsiderReferral.innerHTML = '<div style="text-align:center;padding:24px;color:var(--brand-green)">Drafting referral outreach message...</div>'
    try {
      const outreachMsg = await generateReferralOutreach({ job: currentJob, resume: currentResume, profile: currentProfile })
      bodyInsiderReferral.innerHTML = `
        <div style="font-weight:700;font-size:12px;color:var(--brand-green);margin-bottom:6px">Referral Outreach Email / LinkedIn Note</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;background:rgba(255,255,255,0.03);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);color:#fff">${escHtml(outreachMsg)}</pre>
      `
      document.getElementById('btn-copy-referral-msg').onclick = () => {
        navigator.clipboard.writeText(outreachMsg)
        alert('Referral outreach message copied to clipboard!')
      }
    } catch (err) {
      bodyInsiderReferral.innerHTML = `<div style="color:var(--danger)">Failed: ${escHtml(err.message)}</div>`
    }
  })
}

// ─── Smart Job Autofill Banner ────────────────────────────────────────────────

function attachAutofillBannerListeners() {
  const banner = document.getElementById('btn-smart-autofill-trigger')
  const actionBtn = document.getElementById('btn-autofill-action')

  const triggerAutofill = async () => {
    try {
      const activeTab = await toolGetActiveTab()
      currentAppForm = await analyzeApplicationForm(activeTab.tabId)

      if (!currentAppForm.fields?.length) {
        alert('No interactive application form fields detected on this page.')
        return
      }

      // Execute safe filling
      const safeFields = currentAppForm.fields.filter(f => !f.isHighRisk)
      const personal = currentProfile?.personal || {}
      filledResults = []

      for (const field of safeFields) {
        let val = null
        switch (field.semanticType) {
          case 'first_name': val = personal.name ? personal.name.split(' ')[0] : null; break
          case 'last_name': val = personal.name ? personal.name.split(' ').slice(1).join(' ') : null; break
          case 'full_name': val = personal.name || null; break
          case 'email': val = personal.email || null; break
          case 'phone': val = personal.phone || null; break
          case 'linkedin': val = personal.linkedin || null; break
          case 'github': val = personal.github || null; break
          case 'portfolio': val = personal.portfolio || null; break
          case 'location': val = personal.location || null; break
          case 'resume_upload':
            if (currentResume) {
              const upRes = await uploadResumeToFileField(activeTab.tabId, field, currentResume)
              filledResults.push({ field: field.label || field.name, success: upRes.success, note: upRes.message })
              continue
            }
            break
        }

        if (val) {
          const fillRes = await fillField(activeTab.tabId, field, val)
          filledResults.push({ field: field.label || field.name, success: fillRes.success, value: val })
        }
      }

      // Open review screen
      openAutofillReviewModal()
    } catch (err) {
      alert(`Autofill error: ${err.message}`)
    }
  }

  banner?.addEventListener('click', triggerAutofill)
  actionBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    triggerAutofill()
  })
}

function openAutofillReviewModal() {
  modalAutofillReview.classList.add('active')
  const safeItems = currentAppForm?.fields?.filter(f => !f.isHighRisk) || []
  const highRiskItems = currentAppForm?.fields?.filter(f => f.isHighRisk) || []

  bodyAutofillReview.innerHTML = `
    <div style="font-weight:800;font-size:13px;color:#fff">${escHtml(currentJob?.title || 'Application')} at ${escHtml(currentJob?.company || '')}</div>
    <div style="font-size:11px;color:var(--text-muted)">Filled ${filledResults.length} fields safely with candidate data.</div>

    <div style="background:rgba(255,255,255,0.03);padding:10px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);max-height:140px;overflow-y:auto">
      <div style="font-size:11px;font-weight:700;color:var(--brand-green);margin-bottom:4px">✓ Safe Fields Filled</div>
      ${safeItems.map(f => `
        <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
          <span>${escHtml(f.label || f.name)}</span>
          <span style="color:var(--brand-green)">✓ Filled</span>
        </div>
      `).join('')}
    </div>

    ${highRiskItems.length > 0 ? `
      <div style="background:var(--warning-bg);padding:10px;border-radius:var(--radius-sm);border:1px solid rgba(245,158,11,0.3)">
        <div style="font-size:11px;font-weight:700;color:var(--warning);margin-bottom:4px">⚠️ High-Risk Questions (${highRiskItems.length}) — Human Review Required</div>
        ${highRiskItems.map(f => `
          <div style="font-size:11px;color:#fff;margin-top:2px">• ${escHtml(f.label || f.name)}</div>
        `).join('')}
      </div>
    ` : ''}

    <div style="font-size:11px;color:var(--text-dim);border-top:1px solid var(--glass-border);padding-top:8px">
      🔒 Safety Rule: Review the application on the webpage and click submit yourself.
    </div>
  `
}

document.getElementById('btn-confirm-review-ready')?.addEventListener('click', async () => {
  modalAutofillReview.classList.remove('active')
  alert('Application marked as Reviewed. Please verify on the employer page and click Submit.')
})

// Modal Close Buttons
document.querySelectorAll('.btn-close-modal').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'))
  })
})

// ─── Resume Tab ───────────────────────────────────────────────────────────────

async function loadAndRenderResume() {
  currentResume = await getStoredResume()
  renderResumeCard(resumeContainer, currentResume)

  const dropzone = document.getElementById('resume-dropzone')
  const fileInput = document.getElementById('resume-file-input')
  const btnReplace = document.getElementById('btn-replace-resume')
  const btnRemove = document.getElementById('btn-remove-resume')

  dropzone?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async () => {
    if (fileInput.files?.length) {
      await handleResumeUpload(fileInput.files[0])
    }
  })
  btnReplace?.addEventListener('click', () => fileInput?.click())
  btnRemove?.addEventListener('click', async () => {
    await removeStoredResume()
    await loadAndRenderResume()
  })
}

async function handleResumeUpload(file) {
  try {
    currentResume = await uploadAndStoreResume(file)
    await loadAndRenderResume()
    if (currentJob) {
      currentFitEstimate = calculateJobFit(currentJob, currentResume, currentProfile)
      renderJobrightHeroCard(heroCardContainer, currentJob, currentFitEstimate)
    }
    alert(`Resume "${file.name}" uploaded and parsed successfully!`)
  } catch (err) {
    alert(`Failed to parse resume: ${err.message}`)
  }
}

// ─── Tracker Tab ──────────────────────────────────────────────────────────────

async function renderTrackerView() {
  const apps = await getApplicationsHistory()
  trackerCountEl.textContent = apps.length
  trackerBadgeTotal.textContent = `${apps.length} Tracked`

  // Wire filter pill buttons
  document.querySelectorAll('.tracker-filter-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tracker-filter-btn').forEach(b => {
        b.classList.remove('active')
        b.className = 'pill-badge pill-badge-gray tracker-filter-btn'
      })
      btn.classList.add('active')
      btn.className = 'pill-badge pill-badge-green tracker-filter-btn active'
      trackerCurrentFilter = btn.dataset.filter
      renderFilteredTrackerList(apps)
    }
  })

  renderFilteredTrackerList(apps)
}

function renderFilteredTrackerList(apps) {
  let filtered = apps
  if (trackerCurrentFilter === 'liked') {
    filtered = apps.filter(a => a.isLiked || a.status === APPLICATION_STATUS.LIKED)
  } else if (trackerCurrentFilter === 'applied') {
    filtered = apps.filter(a => a.status === APPLICATION_STATUS.APPLIED || a.status === APPLICATION_STATUS.SUBMITTED)
  } else if (trackerCurrentFilter === 'analyzed') {
    filtered = apps.filter(a => a.status === APPLICATION_STATUS.ANALYZED || a.status === APPLICATION_STATUS.DISCOVERED)
  }

  if (!filtered.length) {
    trackerListContainer.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:24px">No applications match the "${trackerCurrentFilter}" filter.</div>`
    return
  }

  trackerListContainer.innerHTML = filtered.map(a => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);padding:10px 14px;border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center">
      <div style="flex:1;overflow:hidden;margin-right:10px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-weight:700;color:#fff">${escHtml(a.jobTitle)}</span>
          ${a.isLiked ? '<span title="Liked">❤️</span>' : ''}
        </div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml(a.company)} • ${new Date(a.date).toLocaleDateString()}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="pill-badge pill-badge-green">${a.fitScore}% Fit</span>
        <div style="display:flex;gap:4px;align-items:center;margin-top:2px">
          <span class="pill-badge pill-badge-gray" style="font-size:9.5px">${escHtml(a.status)}</span>
          ${a.status !== APPLICATION_STATUS.APPLIED && a.status !== APPLICATION_STATUS.SUBMITTED ? `
            <button class="pill-badge pill-badge-cyan btn-mark-applied" data-id="${a.id}" style="cursor:pointer;border:none;font-size:9.5px" title="Mark as applied">
              ✓ Mark Applied
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('')

  // Wire up Mark Applied buttons
  document.querySelectorAll('.btn-mark-applied').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      await updateApplicationStatus(id, APPLICATION_STATUS.APPLIED)
      await renderTrackerView()
    }
  })
}

async function updateTrackerCount() {
  const apps = await getApplicationsHistory()
  trackerCountEl.textContent = apps.length
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

async function populateProfileInputs() {
  currentProfile = await loadUserProfile()
  const p = currentProfile.personal || {}
  document.getElementById('prof-name').value = p.name || ''
  document.getElementById('prof-email').value = p.email || ''
  document.getElementById('prof-phone').value = p.phone || ''
  document.getElementById('prof-location').value = p.location || ''
  document.getElementById('prof-linkedin').value = p.linkedin || ''
  document.getElementById('prof-github').value = p.github || ''
  document.getElementById('prof-portfolio').value = p.portfolio || ''
  document.getElementById('prof-role').value = currentProfile.currentRole || ''
  document.getElementById('prof-workauth').value = currentProfile.workAuthorization || ''
}

document.getElementById('btn-save-profile-action')?.addEventListener('click', async () => {
  const updates = {
    personal: {
      name: document.getElementById('prof-name').value.trim(),
      email: document.getElementById('prof-email').value.trim(),
      phone: document.getElementById('prof-phone').value.trim(),
      location: document.getElementById('prof-location').value.trim(),
      linkedin: document.getElementById('prof-linkedin').value.trim(),
      github: document.getElementById('prof-github').value.trim(),
      portfolio: document.getElementById('prof-portfolio').value.trim(),
    },
    currentRole: document.getElementById('prof-role').value.trim(),
    workAuthorization: document.getElementById('prof-workauth').value.trim(),
  }
  currentProfile = await updateUserProfile(updates)
  alert('Candidate profile saved successfully!')
})

// ─── Copilot Chat ─────────────────────────────────────────────────────────────

function appendCopilotMessage(role, text) {
  const row = document.createElement('div')
  row.className = `chat-msg-row ${role}`
  row.innerHTML = `<div class="chat-bubble">${escHtml(text)}</div>`
  copilotMessages.appendChild(row)
  copilotMessages.scrollTop = copilotMessages.scrollHeight
}

btnCopilotSend?.addEventListener('click', sendCopilotPrompt)
copilotInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendCopilotPrompt()
  }
})

async function sendCopilotPrompt() {
  const prompt = copilotInput.value.trim()
  if (!prompt || isRunningAgent) return
  copilotInput.value = ''

  appendCopilotMessage('user', prompt)
  isRunningAgent = true

  chrome.runtime.sendMessage({
    type: 'start_session',
    prompt,
    taskName: currentJob ? `${currentJob.title} Assistance` : 'Job Application Assistance',
  }, (resp) => {
    if (resp?.ok && resp.sessionId) {
      activeSessionId = resp.sessionId
      pollSession()
    } else {
      appendCopilotMessage('assistant', `Error: ${resp?.error || 'Could not start session'}`)
      isRunningAgent = false
    }
  })
}

function pollSession() {
  if (pollInterval) clearInterval(pollInterval)
  renderedEventCount = 0

  pollInterval = setInterval(() => {
    if (!activeSessionId) { clearInterval(pollInterval); return }

    chrome.runtime.sendMessage({ type: 'get_session', sessionId: activeSessionId }, (resp) => {
      if (!resp?.ok || !resp.session) return
      const events = resp.session.events || []

      while (renderedEventCount < events.length) {
        const ev = events[renderedEventCount]
        renderedEventCount++

        if (ev.type === 'done' && ev.result) {
          appendCopilotMessage('assistant', ev.result)
          isRunningAgent = false
          clearInterval(pollInterval)
        } else if (ev.type === 'error') {
          appendCopilotMessage('assistant', `❌ ${ev.error}`)
          isRunningAgent = false
          clearInterval(pollInterval)
        }
      }

      if (resp.session.status !== 'running') {
        isRunningAgent = false
        clearInterval(pollInterval)
      }
    })
  }, 400)
}

// ─── Initialization ───────────────────────────────────────────────────────────

;(async () => {
  await initAutomationMode()
  currentProfile = await loadUserProfile()
  await loadAndRenderResume()
  await loadJobAndTools()
  await updateTrackerCount()
})()
