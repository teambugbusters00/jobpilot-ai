/**
 * ui/components.js
 * Renders Jobright-style UI components:
 * - Match Gauge (Score %, Rating, Experience Match, Skill Match, Education Match)
 * - AI Tools Cards (Customize Resume, Build Cover Letter, Fit Analysis, Referral, Interview Prep)
 * - Smart Job Autofill Banner
 * - Overview vs Company Tabs
 */

export function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render the Jobright-style Job Hero Card with 91% Match Box.
 */
export function renderJobrightHeroCard(container, job, fit, isLiked = false) {
  if (!job) {
    container.innerHTML = `
      <div style="text-align:center;padding:18px;color:var(--text-muted)">
        <div style="font-size:24px;margin-bottom:6px">💼</div>
        <div style="font-weight:700;color:#fff;margin-bottom:4px">No Active Job Posting Detected</div>
        <div style="font-size:11.5px;margin-bottom:12px">Open any job posting in your browser tab, then click below.</div>
        <button class="btn btn-brand" id="btn-analyze-active-job" style="width:100%">
          <span>🔍 Analyze Current Tab</span>
        </button>
      </div>
    `
    return
  }

  const score = fit?.overallScore ?? 85
  const rating = fit?.matchRating || 'STRONG MATCH'
  const expMatch = fit?.experienceLevelScore ?? 88
  const skillMatch = fit?.skillsScore ?? 75
  const eduMatch = fit?.educationScore ?? 100
  const h1bBadge = fit?.h1bLikelihood || 'H1B Sponsor Likely'

  const companyLetter = (job.company || 'J').charAt(0).toUpperCase()
  const applyUrl = job.url || '#'

  container.innerHTML = `
    <!-- Top action bar: Like, Share, Apply Now -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:6px">
        <button class="icon-button" id="btn-like-job" title="${isLiked ? 'Unlike job' : 'Save to Liked'}" style="font-size:14px">
          ${isLiked ? '❤️' : '🤍'}
        </button>
        <button class="icon-button" id="btn-share-job" title="Share link" style="font-size:13px">
          🔗
        </button>
      </div>
      <a href="${escHtml(applyUrl)}" target="_blank" class="btn btn-brand btn-sm" id="btn-apply-direct" style="text-decoration:none">
        APPLY NOW ↗
      </a>
    </div>

    <div class="jobright-header-row">
      <div style="flex:1;overflow:hidden">
        <div class="jobright-company-row">
          <div class="company-logo-avatar">${escHtml(companyLetter)}</div>
          <strong style="color:#fff">${escHtml(job.company || 'Company')}</strong>
          <span>• Active Tab</span>
        </div>
        <div class="jobright-title">${escHtml(job.title || 'Job Position')}</div>
      </div>

      <!-- Jobright Match Gauge -->
      <div class="jobright-match-box">
        <div class="match-score-big">
          ${score}<span>%</span>
        </div>
        <div class="match-rating-badge">${escHtml(rating)}</div>
        <div class="match-breakdown-list">
          <div class="match-breakdown-row">
            <span>Experience Level</span>
            <strong>${expMatch}%</strong>
          </div>
          <div class="match-breakdown-row">
            <span>Skill Match</span>
            <strong>${skillMatch}%</strong>
          </div>
          <div class="match-breakdown-row">
            <span>Education Match</span>
            <strong>${eduMatch}%</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Tags & Attributes -->
    <div class="jobright-badges-bar">
      ${job.location ? `<span class="pill-badge pill-badge-gray">📍 ${escHtml(job.location)}</span>` : ''}
      <span class="pill-badge pill-badge-gray">${escHtml(job.workMode || 'Onsite')}</span>
      <span class="pill-badge pill-badge-gray">${escHtml(job.employmentType || 'Internship')}</span>
      <span class="pill-badge pill-badge-green">✔ ${escHtml(h1bBadge)}</span>
      <span class="pill-badge pill-badge-cyan">⚡ Early applicant</span>
      <span class="pill-badge pill-badge-gray">&lt; 25 applicants</span>
    </div>

    <!-- Overview vs Company Switcher -->
    <div style="display:flex;gap:8px;border-bottom:1px solid var(--glass-border);padding-bottom:6px;margin-top:4px">
      <button class="nav-tab-btn active" id="tab-sub-overview" style="padding:4px 8px;font-size:11.5px">Overview</button>
      <button class="nav-tab-btn" id="tab-sub-company" style="padding:4px 8px;font-size:11.5px">Company Insights</button>
    </div>

    <!-- Overview Content -->
    <div id="content-sub-overview" style="font-size:11.5px;color:var(--text-muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45">
      ${escHtml(job.description ? job.description.slice(0, 320) + '...' : 'No description extracted yet.')}
    </div>

    <!-- Company Insights Content (hidden by default) -->
    <div id="content-sub-company" style="display:none;font-size:11.5px;color:var(--text-main);line-height:1.45">
      <div style="color:var(--brand-green);font-weight:700;margin-bottom:4px">🏢 About ${escHtml(job.company || 'the Company')}</div>
      <div id="company-insights-text" style="color:var(--text-muted)">Click to load AI company insights...</div>
    </div>
  `
}

/**
 * Render Jobright AI Tools Cards (Customize Resume, Cover Letter, Fit Analysis, Referral, Interview Prep).
 */
export function renderAiToolsCards(container) {
  container.innerHTML = `
    <div class="ai-tools-section-title">
      <span>✨</span> AI Tools
    </div>

    <div class="ai-tools-list">
      <!-- 1. Customize Your Resume -->
      <div class="ai-tool-card primary-tool" id="tool-customize-resume">
        <div class="ai-tool-left">
          <div class="ai-tool-icon">✨</div>
          <div>
            <div class="ai-tool-title">Customize Your Resume</div>
            <div class="ai-tool-subtext">Maximize your interview chances</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>

      <!-- 2. Build Cover Letter -->
      <div class="ai-tool-card" id="tool-build-cover-letter">
        <div class="ai-tool-left">
          <div class="ai-tool-icon">✉️</div>
          <div>
            <div class="ai-tool-title">Build Cover Letter</div>
            <div class="ai-tool-subtext">Make your application stand out</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>

      <!-- 3. Analyze How Well You Fit -->
      <div class="ai-tool-card" id="tool-analyze-fit">
        <div class="ai-tool-left">
          <div class="ai-tool-icon">👍</div>
          <div>
            <div class="ai-tool-title">Analyze How Well You Fit</div>
            <div class="ai-tool-subtext">Understand your strength &amp; weakness</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>

      <!-- 4. Interview Coaching (NEW) -->
      <div class="ai-tool-card" id="tool-interview-prep">
        <div class="ai-tool-left">
          <div class="ai-tool-icon" style="color:var(--warning)">🎯</div>
          <div>
            <div class="ai-tool-title">Interview Prep <span class="tag" style="background:rgba(245,158,11,0.2);color:var(--warning)">NEW</span></div>
            <div class="ai-tool-subtext">Role-specific behavioral &amp; tech questions</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>

      <!-- 5. Insider Connection & Referral -->
      <div class="ai-tool-card" id="tool-insider-connection">
        <div class="ai-tool-left">
          <div class="ai-tool-icon">🤝</div>
          <div>
            <div class="ai-tool-title">Insider Connection &amp; Referral</div>
            <div class="ai-tool-subtext">Draft networking outreach email</div>
          </div>
        </div>
        <div class="ai-tool-arrow">›</div>
      </div>
    </div>
  `
}

/**
 * Render Jobright Smart Job Autofill Banner.
 */
export function renderSmartAutofillBanner(container, appForm) {
  const fieldsCount = appForm?.fields?.length || 0
  const safeCount = appForm?.safeCount || 0

  container.innerHTML = `
    <div class="smart-autofill-banner" id="btn-smart-autofill-trigger">
      <div>
        <div class="autofill-badge-title">
          <span>⚡</span> Smart Job Autofill
        </div>
        <div class="autofill-subtext">
          ${fieldsCount > 0
            ? `${fieldsCount} form fields detected (${safeCount} safe to autofill)`
            : 'Apply to jobs 5x faster and save hours every week'}
        </div>
      </div>
      <button class="btn btn-brand btn-sm" id="btn-autofill-action">
        ${fieldsCount > 0 ? 'Autofill Now' : 'Detect Form'}
      </button>
    </div>
  `
}

/**
 * Render Resume Card content.
 */
export function renderResumeCard(container, resume) {
  if (!resume || !resume.text) {
    container.innerHTML = `
      <div class="resume-dropzone" id="resume-dropzone" style="border:1.5px dashed var(--glass-border);padding:24px;border-radius:var(--radius-md);text-align:center;cursor:pointer">
        <input type="file" id="resume-file-input" accept=".pdf,.docx,.txt,.md" style="display:none" />
        <div style="font-size:28px;margin-bottom:8px">📄</div>
        <div style="font-weight:700;color:#fff;margin-bottom:4px">Upload Your Resume</div>
        <div style="font-size:11.5px;color:var(--text-muted)">PDF, DOCX, TXT, or MD (Parsed Locally &amp; Privately)</div>
      </div>
    `
    return
  }

  const ext = (resume.fileName || '').split('.').pop().toUpperCase() || 'RESUME'
  container.innerHTML = `
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:var(--radius-md);padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div>
          <div style="font-weight:700;color:#fff">${escHtml(resume.fileName)}</div>
          <div style="font-size:11px;color:var(--brand-green);margin-top:2px">✓ Parsed Successfully • <span class="tag">${escHtml(ext)}</span></div>
        </div>
        <div style="display:flex;gap:6px">
          <input type="file" id="resume-file-input" accept=".pdf,.docx,.txt,.md" style="display:none" />
          <button class="btn btn-secondary btn-sm" id="btn-replace-resume">Replace</button>
          <button class="btn btn-secondary btn-sm" id="btn-remove-resume" style="color:var(--danger)">Remove</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">
        ${escHtml(resume.text.slice(0, 240))}...
      </div>
    </div>
  `
}

/**
 * Render the Fit Breakdown Modal (Jobright "Analyze How Well You Fit").
 */
export function renderFitModalBody(modalBody, job, fit) {
  const strengths = fit?.strengths || []
  const weaknesses = fit?.weaknesses || []
  const recommendations = fit?.recommendations || []

  modalBody.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:var(--radius-sm);padding:10px 14px">
      <div>
        <div style="font-weight:800;color:#fff">${escHtml(job?.title || 'Job Position')}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml(job?.company || 'Company')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:900;color:var(--brand-green)">${fit?.overallScore || 0}%</div>
        <div style="font-size:9.5px;font-weight:800;color:var(--brand-green)">${escHtml(fit?.matchRating || 'STRONG MATCH')}</div>
      </div>
    </div>

    <!-- Match Factors -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);padding:8px;border-radius:var(--radius-sm);text-align:center">
        <div style="font-size:10px;color:var(--text-muted)">Experience</div>
        <strong style="font-size:15px;color:#fff">${fit?.experienceLevelScore || 0}%</strong>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);padding:8px;border-radius:var(--radius-sm);text-align:center">
        <div style="font-size:10px;color:var(--text-muted)">Skills</div>
        <strong style="font-size:15px;color:#fff">${fit?.skillsScore || 0}%</strong>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);padding:8px;border-radius:var(--radius-sm);text-align:center">
        <div style="font-size:10px;color:var(--text-muted)">Education</div>
        <strong style="font-size:15px;color:#fff">${fit?.educationScore || 0}%</strong>
      </div>
    </div>

    <!-- Strengths -->
    <div>
      <div style="font-weight:700;font-size:12px;color:var(--brand-green);margin-bottom:6px">✓ Key Strengths</div>
      <ul style="padding-left:18px;font-size:11.5px;color:var(--text-main);display:flex;flex-direction:column;gap:4px">
        ${strengths.length ? strengths.map(s => `<li>${escHtml(s)}</li>`).join('') : '<li>Profile aligns well with candidate criteria.</li>'}
      </ul>
    </div>

    <!-- Weaknesses / Skill Gaps -->
    <div>
      <div style="font-weight:700;font-size:12px;color:var(--warning);margin-bottom:6px">⚠️ Areas to Address / Gaps</div>
      <ul style="padding-left:18px;font-size:11.5px;color:var(--text-main);display:flex;flex-direction:column;gap:4px">
        ${weaknesses.length ? weaknesses.map(w => `<li>${escHtml(w)}</li>`).join('') : '<li>No critical skill gaps identified.</li>'}
      </ul>
    </div>

    <!-- Recommendations -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);padding:10px;border-radius:var(--radius-sm)">
      <div style="font-weight:700;font-size:12px;color:#fff;margin-bottom:4px">💡 Next Steps</div>
      <ul style="padding-left:18px;font-size:11px;color:var(--text-muted);display:flex;flex-direction:column;gap:4px">
        ${recommendations.map(r => `<li>${escHtml(r)}</li>`).join('')}
      </ul>
    </div>
  `
}
