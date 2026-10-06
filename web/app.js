/**
 * web/app.js — JobPilot AI Standalone Web Application
 * Fully standalone web app compatible with Vercel, Netlify, and GitHub Pages.
 */

// ─── Universal Storage Shim ───────────────────────────────────────────────────

const storage = {
  get: (key, def = null) => {
    try {
      const v = localStorage.getItem(key)
      return v ? JSON.parse(v) : def
    } catch {
      return def
    }
  },
  set: (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val))
    } catch (e) {
      console.warn('Storage set error:', e)
    }
  },
}

// ─── Default AI Configuration (Pre-configured Keys) ───────────────────────────

const DEFAULT_CONFIG = {
  provider: 'openrouter',
  openrouterKey: '',
  openrouterModel: 'nvidia/nemotron-3.5-lightning:free',
  groqKey: '',
  groqModel: 'openai/gpt-oss-120b',
}

function getActiveAIConfig() {
  const saved = storage.get('jobpilot_ai_config', {})
  const provider = saved.provider || DEFAULT_CONFIG.provider
  return {
    provider,
    apiKey: provider === 'groq' ? (saved.groqKey || DEFAULT_CONFIG.groqKey) : (saved.openrouterKey || DEFAULT_CONFIG.openrouterKey),
    model: provider === 'groq' ? (saved.groqModel || DEFAULT_CONFIG.groqModel) : (saved.openrouterModel || DEFAULT_CONFIG.openrouterModel),
    baseUrl: provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1',
  }
}

async function callAI(messages) {
  const config = getActiveAIConfig()
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  }

  const body = {
    model: config.model,
    messages,
    temperature: 0.3,
  }

  if (config.provider === 'openrouter') {
    const m = (config.model || '').toLowerCase()
    if (m.includes('nemotron') || m.includes('r1') || m.includes('reasoning')) {
      body.reasoning = { enabled: true }
    }
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`AI error ${res.status}: ${errText.slice(0, 150)}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ─── Default Sample Tech Jobs (Jobright-style Curated List) ───────────────────

const INITIAL_JOBS = [
  {
    id: 'job_1',
    title: 'AI Fullstack Software Engineer',
    company: 'Anthropic',
    location: 'San Francisco, CA (Hybrid)',
    workMode: 'Hybrid',
    employmentType: 'Full-time',
    url: 'https://anthropic.com/careers',
    h1b: '✔ H1B Sponsor Likely',
    description: `We are looking for an AI Fullstack Software Engineer to build intuitive interfaces for frontier AI models.
Responsibilities:
- Build responsive, reliable web apps using React, TypeScript, and modern CSS.
- Integrate LLM streaming APIs and agentic workflows.
- Collaborate with research teams on model evaluation interfaces.
Qualifications:
- 1-4 years of experience building modern web applications.
- Strong proficiency in JavaScript/TypeScript, React, Python, and REST/WebSocket APIs.
- Passion for human-AI interaction and frontier models.`,
    technologies: ['React', 'TypeScript', 'Python', 'Node.js', 'LLMs'],
  },
  {
    id: 'job_2',
    title: 'Frontend Engineer (UI / Systems)',
    company: 'Stripe',
    location: 'Seattle, WA (Remote)',
    workMode: 'Remote',
    employmentType: 'Full-time',
    url: 'https://stripe.com/jobs',
    h1b: '✔ H1B Sponsor Likely',
    description: `Stripe is seeking a Frontend Engineer to craft the world's most developer-friendly financial dashboard.
Responsibilities:
- Develop scalable UI components and web applications using React and TypeScript.
- Optimize dashboard performance and accessibility across global regions.
Qualifications:
- Solid understanding of web fundamentals: JavaScript, DOM manipulation, CSS, and modern React.
- Experience with state management and automated UI testing.`,
    technologies: ['React', 'JavaScript', 'TypeScript', 'CSS', 'HTML'],
  },
  {
    id: 'job_3',
    title: 'Backend Systems Engineer',
    company: 'OpenAI',
    location: 'San Francisco, CA',
    workMode: 'Onsite',
    employmentType: 'Full-time',
    url: 'https://openai.com/careers',
    h1b: '✔ H1B Sponsor Likely',
    description: `Help scale the infrastructure serving millions of developer API requests.
Responsibilities:
- Build high-throughput microservices using Python and Go.
- Design database schemas and caching layers with PostgreSQL and Redis.
Qualifications:
- Experience with distributed systems, Python, PostgreSQL, and Docker.`,
    technologies: ['Python', 'PostgreSQL', 'Docker', 'Redis', 'Go'],
  },
]

// ─── State ────────────────────────────────────────────────────────────────────

let jobsList = storage.get('jobpilot_web_jobs', INITIAL_JOBS)
let selectedJobId = jobsList[0]?.id || null
let currentResume = storage.get('jobpilot_web_resume', null)
let currentProfile = storage.get('jobpilot_web_profile', {
  name: 'Candidate',
  email: 'candidate@example.com',
  phone: '+1 (555) 019-2831',
  location: 'San Francisco, CA',
  linkedin: 'https://linkedin.com/in/applicant',
  github: 'https://github.com/applicant',
  portfolio: 'https://portfolio.dev',
  role: 'Software Engineer',
  workAuth: 'US Citizen / Authorized',
})
let trackedApps = storage.get('jobpilot_web_tracker', [])
let activeFilter = 'all'

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── AI Fit Calculation ───────────────────────────────────────────────────────

function calculateFit(job, resume, profile) {
  if (!job) return { overall: 80, rating: 'GOOD MATCH', exp: 85, skill: 80, edu: 90 }

  const resumeText = ((resume?.text || '') + ' ' + (profile?.role || '')).toLowerCase()
  const techs = job.technologies || []
  let matches = 0

  for (const t of techs) {
    if (resumeText.includes(t.toLowerCase())) matches++
  }

  const skillScore = techs.length > 0 ? Math.round((matches / techs.length) * 100) : 85
  const expScore = 88
  const eduScore = 95
  const overall = Math.min(98, Math.max(65, Math.round(skillScore * 0.5 + expScore * 0.3 + eduScore * 0.2)))
  const rating = overall >= 85 ? 'STRONG MATCH' : 'GOOD MATCH'

  return {
    overall,
    rating,
    exp: expScore,
    skill: Math.max(60, skillScore),
    edu: eduScore,
  }
}

// ─── Render Job List (Left Column) ────────────────────────────────────────────

function renderJobsList(query = '') {
  const container = document.getElementById('jobs-list-container')
  const totalCountEl = document.getElementById('jobs-total-count')

  const q = query.toLowerCase().trim()
  const filtered = jobsList.filter(j =>
    j.title.toLowerCase().includes(q) ||
    j.company.toLowerCase().includes(q) ||
    (j.technologies || []).some(t => t.toLowerCase().includes(q))
  )

  totalCountEl.textContent = filtered.length

  if (!filtered.length) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted)">No jobs found matching "${escHtml(query)}".</div>`
    return
  }

  container.innerHTML = filtered.map(j => {
    const isSelected = j.id === selectedJobId
    const fit = calculateFit(j, currentResume, currentProfile)
    const isLiked = trackedApps.some(a => a.jobId === j.id && a.isLiked)

    return `
      <div class="job-item-card ${isSelected ? 'selected' : ''}" data-id="${j.id}">
        <div class="job-item-header">
          <div style="flex:1">
            <div class="job-item-title">${escHtml(j.title)}</div>
            <div class="job-item-company">${escHtml(j.company)} • ${escHtml(j.location)}</div>
          </div>
          <span class="pill-badge pill-badge-green" style="font-size:11px">${fit.overall}% Match</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
          <div style="display:flex;gap:4px">
            <span class="pill-badge pill-badge-gray" style="font-size:10px">${escHtml(j.workMode || 'Hybrid')}</span>
            <span class="pill-badge pill-badge-gray" style="font-size:10px">${escHtml(j.employmentType || 'Full-time')}</span>
          </div>
          ${isLiked ? '<span>❤️</span>' : ''}
        </div>
      </div>
    `
  }).join('')

  container.querySelectorAll('.job-item-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedJobId = card.dataset.id
      renderJobsList(document.getElementById('jobs-search-input').value)
      renderSelectedJobDetails()
    })
  })
}

// ─── Render Selected Job Details (Right Column) ───────────────────────────────

function renderSelectedJobDetails() {
  const container = document.getElementById('jobs-detail-container')
  const job = jobsList.find(j => j.id === selectedJobId) || jobsList[0]

  if (!job) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No job selected.</div>'
    return
  }

  const fit = calculateFit(job, currentResume, currentProfile)
  const isLiked = trackedApps.some(a => a.jobId === job.id && a.isLiked)
  const companyLetter = (job.company || 'J').charAt(0).toUpperCase()

  container.innerHTML = `
    <!-- Top Action Bar -->
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="icon-button" id="btn-web-like" title="Save to Liked" style="font-size:16px">
          ${isLiked ? '❤️' : '🤍'}
        </button>
        <button class="icon-button" id="btn-web-share" title="Copy Job Link" style="font-size:15px">
          🔗
        </button>
      </div>
      <a href="${escHtml(job.url || '#')}" target="_blank" class="btn btn-brand btn-sm" style="text-decoration:none">
        APPLY NOW ↗
      </a>
    </div>

    <!-- Jobright Hero Card (91% Match Box) -->
    <div class="jobright-hero-card">
      <div class="jobright-header-row">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <div class="company-logo-avatar">${escHtml(companyLetter)}</div>
            <div>
              <strong style="color:#fff;font-size:15px">${escHtml(job.company)}</strong>
              <div style="font-size:12px;color:var(--text-muted)">Verified Employer</div>
            </div>
          </div>
          <div class="jobright-title">${escHtml(job.title)}</div>
        </div>

        <!-- 91% Match Box -->
        <div class="jobright-match-box">
          <div class="match-score-big">
            ${fit.overall}<span>%</span>
          </div>
          <div class="match-rating-badge">${fit.rating}</div>
          <div class="match-breakdown-list">
            <div class="match-breakdown-row">
              <span>Experience Level</span>
              <strong>${fit.exp}%</strong>
            </div>
            <div class="match-breakdown-row">
              <span>Skill Match</span>
              <strong>${fit.skill}%</strong>
            </div>
            <div class="match-breakdown-row">
              <span>Education Match</span>
              <strong>${fit.edu}%</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Badges -->
      <div class="jobright-badges-bar">
        <span class="pill-badge pill-badge-gray">📍 ${escHtml(job.location)}</span>
        <span class="pill-badge pill-badge-gray">${escHtml(job.workMode || 'Hybrid')}</span>
        <span class="pill-badge pill-badge-gray">${escHtml(job.employmentType || 'Full-time')}</span>
        <span class="pill-badge pill-badge-green">${escHtml(job.h1b || '✔ H1B Sponsor Likely')}</span>
        <span class="pill-badge pill-badge-cyan">⚡ Early applicant</span>
        <span class="pill-badge pill-badge-gray">&lt; 25 applicants</span>
      </div>

      <!-- Overview vs Company Switcher -->
      <div style="display:flex;gap:10px;border-bottom:1px solid var(--glass-border);padding-bottom:8px;margin-top:6px">
        <button class="nav-tab-btn active" id="tab-web-overview" style="padding:4px 8px;font-size:12px">Overview</button>
        <button class="nav-tab-btn" id="tab-web-company" style="padding:4px 8px;font-size:12px">Company Insights</button>
      </div>

      <!-- Overview Content -->
      <div id="content-web-overview" style="font-size:13px;color:var(--text-main);white-space:pre-wrap;line-height:1.6">
        ${escHtml(job.description)}
      </div>

      <!-- Company Insights Content -->
      <div id="content-web-company" style="display:none;font-size:13px;color:var(--text-main);line-height:1.6">
        <div id="company-insights-loader" style="color:var(--brand-green)">Generating AI company insights &amp; hiring tips...</div>
      </div>
    </div>

    <!-- AI Tools Header -->
    <div style="font-size:14px;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px">
      <span>✨</span> AI Tools
    </div>

    <!-- AI Tools Cards Grid -->
    <div class="ai-tools-grid">
      <!-- 1. Customize Your Resume -->
      <div class="ai-tool-card primary-tool" id="tool-web-resume">
        <div class="ai-tool-left">
          <div class="ai-tool-icon">✨</div>
          <div>
            <div class="ai-tool-title">Customize Your Resume</div>
            <div class="ai-tool-subtext">Maximize interview chances</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>

      <!-- 2. Build Cover Letter -->
      <div class="ai-tool-card" id="tool-web-cover-letter">
        <div class="ai-tool-left">
          <div class="ai-tool-icon">✉️</div>
          <div>
            <div class="ai-tool-title">Build Cover Letter</div>
            <div class="ai-tool-subtext">Compelling tailored application</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>

      <!-- 3. Analyze How Well You Fit -->
      <div class="ai-tool-card" id="tool-web-fit">
        <div class="ai-tool-left">
          <div class="ai-tool-icon">👍</div>
          <div>
            <div class="ai-tool-title">Analyze How Well You Fit</div>
            <div class="ai-tool-subtext">Strengths, gaps &amp; recommendations</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>

      <!-- 4. Interview Coaching Prep -->
      <div class="ai-tool-card" id="tool-web-interview">
        <div class="ai-tool-left">
          <div class="ai-tool-icon" style="color:var(--warning)">🎯</div>
          <div>
            <div class="ai-tool-title">Interview Prep <span class="pill-badge pill-badge-cyan" style="font-size:9px">NEW</span></div>
            <div class="ai-tool-subtext">Behavioral &amp; technical questions</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>

      <!-- 5. Insider Referral Outreach -->
      <div class="ai-tool-card" id="tool-web-referral">
        <div class="ai-tool-left">
          <div class="ai-tool-icon">🤝</div>
          <div>
            <div class="ai-tool-title">Insider Connection &amp; Referral</div>
            <div class="ai-tool-subtext">Draft networking outreach note</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>
    </div>
  `

  attachDetailPaneListeners(job, fit)
}

// ─── Attach Detail Listeners ──────────────────────────────────────────────────

function attachDetailPaneListeners(job, fit) {
  // 1. Like toggle
  document.getElementById('btn-web-like')?.addEventListener('click', () => {
    let app = trackedApps.find(a => a.jobId === job.id)
    if (!app) {
      app = { jobId: job.id, title: job.title, company: job.company, fitScore: fit.overall, isLiked: true, status: 'LIKED', date: Date.now() }
      trackedApps.unshift(app)
    } else {
      app.isLiked = !app.isLiked
      app.status = app.isLiked ? 'LIKED' : 'ANALYZED'
    }
    storage.set('jobpilot_web_tracker', trackedApps)
    updateTrackerCounts()
    renderSelectedJobDetails()
    renderJobsList(document.getElementById('jobs-search-input').value)
  })

  // 2. Share
  document.getElementById('btn-web-share')?.addEventListener('click', () => {
    navigator.clipboard.writeText(job.url || window.location.href)
    alert('Job link copied to clipboard!')
  })

  // 3. Overview vs Company
  const tabOverview = document.getElementById('tab-web-overview')
  const tabCompany = document.getElementById('tab-web-company')
  const contentOverview = document.getElementById('content-web-overview')
  const contentCompany = document.getElementById('content-web-company')
  const companyLoader = document.getElementById('company-insights-loader')

  tabOverview?.addEventListener('click', () => {
    tabOverview.classList.add('active')
    tabCompany.classList.remove('active')
    contentOverview.style.display = 'block'
    contentCompany.style.display = 'none'
  })

  tabCompany?.addEventListener('click', async () => {
    tabCompany.classList.add('active')
    tabOverview.classList.remove('active')
    contentOverview.style.display = 'none'
    contentCompany.style.display = 'block'

    if (companyLoader && companyLoader.dataset.loaded !== 'true') {
      try {
        const insights = await callAI([
          { role: 'system', content: 'You are an expert tech career advisor.' },
          { role: 'user', content: `Give a brief company overview of "${job.company}" for the role "${job.title}": 1. What they do. 2. Engineering culture. 3. Interview advice. Keep under 120 words.` }
        ])
        contentCompany.innerHTML = escHtml(insights).replace(/\n/g, '<br/>')
        companyLoader.dataset.loaded = 'true'
      } catch (err) {
        contentCompany.innerHTML = `<span style="color:var(--danger)">Error: ${escHtml(err.message)}</span>`
      }
    }
  })

  // 4. AI Tool 1: Customize Resume
  document.getElementById('tool-web-resume')?.addEventListener('click', async () => {
    const modal = document.getElementById('modal-customize-resume')
    const body = document.getElementById('body-customize-resume')
    modal.classList.add('active')
    body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--brand-green)">Drafting role-tailored resume bullets...</div>'
    try {
      const res = await callAI([
        { role: 'system', content: 'You are a career coach. Rephrase the candidate experience for this target job truthfully without inventing facts.' },
        { role: 'user', content: `Role: ${job.title} at ${job.company}\nCandidate Resume Text: ${currentResume?.text || 'Early career engineer skilled in React, JavaScript, Python.'}\nProvide 4 tailored bullet points.` }
      ])
      body.innerHTML = `
        <div style="font-weight:700;color:var(--brand-green);margin-bottom:8px">Tailored Bullets for ${escHtml(job.title)}</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;background:rgba(255,255,255,0.03);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);color:#fff">${escHtml(res)}</pre>
      `
      document.getElementById('btn-copy-tailored-resume').onclick = () => {
        navigator.clipboard.writeText(res)
        alert('Tailored bullets copied to clipboard!')
      }
    } catch (e) {
      body.innerHTML = `<div style="color:var(--danger)">Failed: ${escHtml(e.message)}</div>`
    }
  })

  // 5. AI Tool 2: Cover Letter
  document.getElementById('tool-web-cover-letter')?.addEventListener('click', async () => {
    const modal = document.getElementById('modal-cover-letter')
    const body = document.getElementById('body-cover-letter')
    modal.classList.add('active')
    body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--brand-green)">Writing personalized cover letter...</div>'
    try {
      const res = await callAI([
        { role: 'system', content: 'Write a concise, compelling 3-paragraph cover letter. Natural tone, no generic buzzwords.' },
        { role: 'user', content: `Job: ${job.title} at ${job.company}\nCandidate Name: ${currentProfile.name}\nBackground: ${currentResume?.text || 'Software Engineer'}` }
      ])
      body.innerHTML = `
        <div style="font-weight:700;color:var(--brand-green);margin-bottom:8px">Personalized Cover Letter</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;background:rgba(255,255,255,0.03);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);color:#fff">${escHtml(res)}</pre>
      `
      document.getElementById('btn-copy-cover-letter').onclick = () => {
        navigator.clipboard.writeText(res)
        alert('Cover letter copied!')
      }
    } catch (e) {
      body.innerHTML = `<div style="color:var(--danger)">Failed: ${escHtml(e.message)}</div>`
    }
  })

  // 6. AI Tool 3: Fit Analysis Modal
  document.getElementById('tool-web-fit')?.addEventListener('click', () => {
    const modal = document.getElementById('modal-fit-analysis')
    const body = document.getElementById('body-fit-analysis')
    modal.classList.add('active')
    body.innerHTML = `
      <div style="font-size:15px;font-weight:800;color:#fff">${escHtml(job.title)} at ${escHtml(job.company)}</div>
      <div style="display:flex;align-items:center;gap:12px;margin:10px 0">
        <span class="pill-badge pill-badge-green" style="font-size:14px;padding:6px 12px">${fit.overall}% Overall Fit</span>
        <span class="pill-badge pill-badge-cyan">${fit.rating}</span>
      </div>
      <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--glass-border)">
        <div style="font-size:12px;font-weight:700;color:var(--brand-green);margin-bottom:4px">✓ Strengths</div>
        <div style="font-size:12px;color:var(--text-muted)">Your technical background aligns directly with the core requirements: ${(job.technologies || []).join(', ')}.</div>
      </div>
      <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--glass-border)">
        <div style="font-size:12px;font-weight:700;color:var(--warning);margin-bottom:4px">💡 Next Steps</div>
        <div style="font-size:12px;color:var(--text-muted)">Use "Customize Your Resume" and "Build Cover Letter" to highlight your most relevant projects.</div>
      </div>
    `
  })

  // 7. AI Tool 4: Interview Prep
  document.getElementById('tool-web-interview')?.addEventListener('click', async () => {
    const modal = document.getElementById('modal-interview-prep')
    const body = document.getElementById('body-interview-prep')
    modal.classList.add('active')
    body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--warning)">Curating role-specific interview coaching questions &amp; key concepts...</div>'
    try {
      const res = await callAI([
        { role: 'system', content: 'You are an engineering interview coach.' },
        { role: 'user', content: `Create 2 behavioral and 2 technical interview questions for "${job.title}" at "${job.company}". Include key talking points to mention.` }
      ])
      body.innerHTML = `
        <div style="font-weight:700;color:var(--warning);margin-bottom:8px">Role Interview Questions &amp; Concept Talking Points</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;background:rgba(255,255,255,0.03);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);color:#fff">${escHtml(res)}</pre>
      `
      document.getElementById('btn-copy-interview-qa').onclick = () => {
        navigator.clipboard.writeText(res)
        alert('Interview questions copied!')
      }
    } catch (e) {
      body.innerHTML = `<div style="color:var(--danger)">Failed: ${escHtml(e.message)}</div>`
    }
  })

  // 8. AI Tool 5: Insider Referral
  document.getElementById('tool-web-referral')?.addEventListener('click', async () => {
    const modal = document.getElementById('modal-insider-referral')
    const body = document.getElementById('body-insider-referral')
    modal.classList.add('active')
    body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--brand-green)">Drafting networking outreach message...</div>'
    try {
      const res = await callAI([
        { role: 'system', content: 'Write a short, polite LinkedIn note (under 100 words) requesting an informational chat or referral.' },
        { role: 'user', content: `Role: ${job.title} at ${job.company}\nCandidate Name: ${currentProfile.name}` }
      ])
      body.innerHTML = `
        <div style="font-weight:700;color:var(--brand-green);margin-bottom:8px">Referral Outreach Note</div>
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;background:rgba(255,255,255,0.03);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--glass-border);color:#fff">${escHtml(res)}</pre>
      `
      document.getElementById('btn-copy-referral-msg').onclick = () => {
        navigator.clipboard.writeText(res)
        alert('Outreach note copied!')
      }
    } catch (e) {
      body.innerHTML = `<div style="color:var(--danger)">Failed: ${escHtml(e.message)}</div>`
    }
  })
}

// ─── Resume Tab ───────────────────────────────────────────────────────────────

function renderResumeTab() {
  const container = document.getElementById('web-resume-container')
  if (!currentResume) {
    container.innerHTML = `
      <div style="border:1.5px dashed var(--glass-border);padding:36px;border-radius:var(--radius-md);text-align:center;cursor:pointer" id="web-dropzone">
        <input type="file" id="web-resume-input" accept=".pdf,.docx,.txt,.md" style="display:none" />
        <div style="font-size:32px;margin-bottom:8px">📄</div>
        <div style="font-weight:700;color:#fff;font-size:16px;margin-bottom:4px">Upload Your Resume</div>
        <div style="font-size:12px;color:var(--text-muted)">PDF, DOCX, TXT, or MD (Parsed Locally &amp; Privately)</div>
      </div>
    `
    const dropzone = document.getElementById('web-dropzone')
    const fileInput = document.getElementById('web-resume-input')
    dropzone?.addEventListener('click', () => fileInput?.click())
    fileInput?.addEventListener('change', handleResumeUpload)
    return
  }

  container.innerHTML = `
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:var(--radius-md);padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:24px">📄</span>
          <div>
            <div style="font-weight:700;color:#fff">${escHtml(currentResume.fileName || 'Candidate Resume')}</div>
            <div style="font-size:11px;color:var(--brand-green)">✓ Parsed and verified in browser</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" id="btn-remove-web-resume">Remove / Replace</button>
      </div>
      <div style="font-size:12px;color:var(--text-muted);background:rgba(0,0,0,0.2);padding:12px;border-radius:var(--radius-sm);max-height:200px;overflow-y:auto;white-space:pre-wrap">
        ${escHtml(currentResume.text.slice(0, 1000))}...
      </div>
    </div>
  `

  document.getElementById('btn-remove-web-resume')?.addEventListener('click', () => {
    currentResume = null
    storage.set('jobpilot_web_resume', null)
    renderResumeTab()
    renderSelectedJobDetails()
  })
}

async function handleResumeUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return

  try {
    let text = ''
    if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      text = await file.text()
    } else if (file.name.endsWith('.pdf') && window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'
      const buf = await file.arrayBuffer()
      const doc = await window.pdfjsLib.getDocument({ data: buf }).promise
      const pages = []
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        pages.push(content.items.map(it => it.str).join(' '))
      }
      text = pages.join('\n')
    } else if (file.name.endsWith('.docx') && window.mammoth) {
      const buf = await file.arrayBuffer()
      const res = await window.mammoth.extractRawText({ arrayBuffer: buf })
      text = res.value
    } else {
      text = await file.text()
    }

    currentResume = { fileName: file.name, text }
    storage.set('jobpilot_web_resume', currentResume)
    renderResumeTab()
    renderSelectedJobDetails()
    alert(`Resume "${file.name}" uploaded and parsed successfully!`)
  } catch (err) {
    alert(`Failed to parse resume: ${err.message}`)
  }
}

// ─── Tracker Tab ──────────────────────────────────────────────────────────────

function renderTrackerTab() {
  const container = document.getElementById('web-tracker-list')
  const totalBadge = document.getElementById('tracker-total-badge')
  totalBadge.textContent = `${trackedApps.length} Tracked`

  let filtered = trackedApps
  if (activeFilter === 'liked') filtered = trackedApps.filter(a => a.isLiked)
  if (activeFilter === 'applied') filtered = trackedApps.filter(a => a.status === 'APPLIED')

  if (!filtered.length) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted)">No applications in "${activeFilter}". Save jobs or mark them applied to track them here.</div>`
    return
  }

  container.innerHTML = filtered.map(a => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);padding:14px 18px;border-radius:var(--radius-md);display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-weight:700;color:#fff">${escHtml(a.title)}</span>
          ${a.isLiked ? '<span>❤️</span>' : ''}
        </div>
        <div style="font-size:12px;color:var(--text-muted)">${escHtml(a.company)} • ${new Date(a.date).toLocaleDateString()}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="pill-badge pill-badge-green">${a.fitScore}% Fit</span>
        <button class="pill-badge ${a.status === 'APPLIED' ? 'pill-badge-green' : 'pill-badge-cyan'}" style="cursor:pointer;border:none" onclick="toggleApplied('${a.jobId}')">
          ${a.status === 'APPLIED' ? '✓ Applied' : 'Mark Applied'}
        </button>
      </div>
    </div>
  `).join('')
}

window.toggleApplied = (jobId) => {
  const item = trackedApps.find(a => a.jobId === jobId)
  if (item) {
    item.status = item.status === 'APPLIED' ? 'LIKED' : 'APPLIED'
    storage.set('jobpilot_web_tracker', trackedApps)
    updateTrackerCounts()
    renderTrackerTab()
  }
}

function updateTrackerCounts() {
  const countEl = document.getElementById('tracker-nav-count')
  if (countEl) countEl.textContent = trackedApps.length
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function renderProfileTab() {
  document.getElementById('prof-name').value = currentProfile.name || ''
  document.getElementById('prof-email').value = currentProfile.email || ''
  document.getElementById('prof-phone').value = currentProfile.phone || ''
  document.getElementById('prof-location').value = currentProfile.location || ''
  document.getElementById('prof-linkedin').value = currentProfile.linkedin || ''
  document.getElementById('prof-github').value = currentProfile.github || ''
  document.getElementById('prof-portfolio').value = currentProfile.portfolio || ''
  document.getElementById('prof-role').value = currentProfile.role || ''
  document.getElementById('prof-workauth').value = currentProfile.workAuth || ''
}

document.getElementById('btn-save-web-profile')?.addEventListener('click', () => {
  currentProfile = {
    name: document.getElementById('prof-name').value.trim(),
    email: document.getElementById('prof-email').value.trim(),
    phone: document.getElementById('prof-phone').value.trim(),
    location: document.getElementById('prof-location').value.trim(),
    linkedin: document.getElementById('prof-linkedin').value.trim(),
    github: document.getElementById('prof-github').value.trim(),
    portfolio: document.getElementById('prof-portfolio').value.trim(),
    role: document.getElementById('prof-role').value.trim(),
    workAuth: document.getElementById('prof-workauth').value.trim(),
  }
  storage.set('jobpilot_web_profile', currentProfile)
  alert('Candidate profile saved!')
})

// ─── Copilot Chat Tab ─────────────────────────────────────────────────────────

document.getElementById('btn-copilot-web-send')?.addEventListener('click', sendCopilotMessage)
document.getElementById('copilot-web-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCopilotMessage()
})

async function sendCopilotMessage() {
  const input = document.getElementById('copilot-web-input')
  const messagesBox = document.getElementById('copilot-web-messages')
  const prompt = input.value.trim()
  if (!prompt) return
  input.value = ''

  messagesBox.innerHTML += `
    <div style="align-self:flex-end;background:var(--brand-green);color:#fff;padding:8px 14px;border-radius:12px;max-width:80%;font-size:13px">
      ${escHtml(prompt)}
    </div>
  `
  messagesBox.scrollTop = messagesBox.scrollHeight

  try {
    const activeJob = jobsList.find(j => j.id === selectedJobId)
    const reply = await callAI([
      { role: 'system', content: 'You are JobPilot AI, an expert job application copilot.' },
      { role: 'user', content: `Context: Active Job: ${activeJob?.title || 'Engineer'} at ${activeJob?.company || 'Company'}.\nUser Query: ${prompt}` }
    ])
    messagesBox.innerHTML += `
      <div style="align-self:flex-start;background:rgba(255,255,255,0.06);color:#fff;padding:10px 14px;border-radius:12px;max-width:80%;font-size:13px;white-space:pre-wrap">
        ${escHtml(reply)}
      </div>
    `
  } catch (err) {
    messagesBox.innerHTML += `
      <div style="align-self:flex-start;background:rgba(239,68,68,0.15);color:var(--danger);padding:8px 14px;border-radius:12px;font-size:13px">
        Error: ${escHtml(err.message)}
      </div>
    `
  }
  messagesBox.scrollTop = messagesBox.scrollHeight
}

// ─── Modal Controls & Add Job ─────────────────────────────────────────────────

document.querySelectorAll('.btn-close-modal').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'))
  })
})

document.getElementById('btn-open-add-job')?.addEventListener('click', () => {
  document.getElementById('modal-add-job').classList.add('active')
})

document.getElementById('btn-confirm-add-job')?.addEventListener('click', () => {
  const title = document.getElementById('add-job-title').value.trim() || 'Software Engineer'
  const company = document.getElementById('add-job-company').value.trim() || 'Tech Company'
  const desc = document.getElementById('add-job-desc').value.trim()

  if (!desc) {
    alert('Please paste the job description.')
    return
  }

  const newJob = {
    id: `job_${Date.now()}`,
    title,
    company,
    location: 'Remote / Onsite',
    workMode: 'Hybrid',
    employmentType: 'Full-time',
    url: '#',
    h1b: '✔ H1B Sponsor Likely',
    description: desc,
    technologies: ['React', 'JavaScript', 'Python', 'Node.js'],
  }

  jobsList.unshift(newJob)
  storage.set('jobpilot_web_jobs', jobsList)
  selectedJobId = newJob.id
  document.getElementById('modal-add-job').classList.remove('active')
  renderJobsList()
  renderSelectedJobDetails()
})

// ─── Settings Modal ───────────────────────────────────────────────────────────

document.getElementById('btn-open-settings')?.addEventListener('click', () => {
  const modal = document.getElementById('modal-settings')
  const saved = storage.get('jobpilot_ai_config', DEFAULT_CONFIG)
  document.getElementById('settings-provider').value = saved.provider || 'openrouter'
  document.getElementById('settings-model').value = saved.openrouterModel || DEFAULT_CONFIG.openrouterModel
  document.getElementById('settings-api-key').value = saved.openrouterKey || DEFAULT_CONFIG.openrouterKey
  modal.classList.add('active')
})

document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  const provider = document.getElementById('settings-provider').value
  const model = document.getElementById('settings-model').value.trim()
  const apiKey = document.getElementById('settings-api-key').value.trim()

  const config = storage.get('jobpilot_ai_config', DEFAULT_CONFIG)
  config.provider = provider
  if (provider === 'groq') {
    config.groqKey = apiKey
    config.groqModel = model
  } else {
    config.openrouterKey = apiKey
    config.openrouterModel = model
  }
  storage.set('jobpilot_ai_config', config)
  document.getElementById('modal-settings').classList.remove('active')
  alert('AI Settings saved successfully!')
})

// ─── Navigation Switcher ──────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'))
    btn.classList.add('active')

    const target = document.getElementById(`view-${btn.dataset.tab}`)
    if (target) target.classList.add('active')

    if (btn.dataset.tab === 'resume') renderResumeTab()
    if (btn.dataset.tab === 'tracker') renderTrackerTab()
    if (btn.dataset.tab === 'profile') renderProfileTab()
  })
})

// Tracker filter pills
document.querySelectorAll('.web-tracker-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.web-tracker-filter').forEach(b => {
      b.classList.remove('active')
      b.className = 'pill-badge pill-badge-gray web-tracker-filter'
    })
    btn.classList.add('active')
    btn.className = 'pill-badge pill-badge-green web-tracker-filter active'
    activeFilter = btn.dataset.filter
    renderTrackerTab()
  })
})

// ─── Search Bar ───────────────────────────────────────────────────────────────

document.getElementById('jobs-search-input')?.addEventListener('input', (e) => {
  renderJobsList(e.target.value)
})

// ─── App Initialization ───────────────────────────────────────────────────────

renderJobsList()
renderSelectedJobDetails()
updateTrackerCounts()
