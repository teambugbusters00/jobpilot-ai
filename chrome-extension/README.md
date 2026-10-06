# JobPilot AI — Chrome Extension

> **AI copilot for smarter job applications.**  
> AI-powered browser copilot for job discovery, job analysis, resume tailoring, and application form assistance.

Runs directly inside your daily Chrome browser as a Chrome Side Panel and extension service worker.

---

## Jobright.ai Feature Parity

JobPilot AI replicates the entire feature set and workflow of **[Jobright.ai](https://jobright.ai/jobs)** directly inside your Chrome Side Panel:

1. **Jobright Match Gauge & AI Fit Breakdown**:
   - **Overall Match Score** (e.g. 91% Match) & Badge (`STRONG MATCH` / `GOOD MATCH`).
   - **Detailed Alignment Breakdown**: Experience Level %, Skill Match %, Education Match %.
   - **Role Badges**: Work mode (Remote/Hybrid/Onsite), Type, H1B Sponsor Likelihood (`✔ H1B Sponsor Likely`), Early Applicant (`⚡ Early applicant`), Applicant count estimate (`< 25 applicants`).
   - **AI Fit Analysis Modal**: Detailed review of strengths, skill gaps, missing keywords, and recommendations.

2. **AI Tools Suite (1-Click Action Cards)**:
   - **✨ Customize Your Resume**: Generates role-tailored bullet points matching real experience to job requirements (never hallucinating).
   - **✉️ Build Cover Letter**: Drafts a conversational, 3-paragraph tailored cover letter.
   - **👍 Analyze How Well You Fit**: Comprehensive breakdown of strengths, gaps, and suggested improvements.
   - **🎯 Role Interview Prep (NEW)**: Curates the top 4 behavioral and technical interview questions tailored to the company and tech stack with key concepts to mention.
   - **🤝 Insider Connection & Referral**: Crafts high-conversion LinkedIn / email networking notes to ask employees or alumni for referrals.

3. **⚡ Smart Job Autofill**:
   - Detects all application form fields across Greenhouse, Lever, Ashby, Workable, Workday, and custom career portals.
   - **Safe Auto-Fill**: Fills contact details, links (LinkedIn, GitHub, Portfolio), location, and candidate background safely.
   - **High-Risk Question Isolation**: Flags sensitive questions (desired salary, visa sponsorship, legal self-ID) for human review.
   - **Strict Human-in-the-Loop**: Never auto-submits. Presents an Application Review Screen; user always clicks Submit on the page.

4. **🏢 Overview & AI Company Insights**:
   - **Overview Tab**: Key description, role requirements, and technical keywords.
   - **Company Insights Tab**: On-demand AI analysis of company mission, engineering culture, and tips for standing out.

5. **📊 Applications Tracker**:
   - Filter jobs by **All**, **Liked ❤️**, **Applied 🚀**, and **Analyzed 🔍**.
   - Track application status, date, and calculated fit score.
   - 1-click status transitions (e.g. Mark as Applied).

6. **📄 Local Resume Parsing & 👤 Profile Management**:
   - Parses PDF, DOCX, TXT, MD locally inside Chrome via bundled `pdfjs` and `mammoth` (no external servers).
   - Truthful extraction of skills, education, and experience without fabrication.
   - Candidate profile editor with instant persistence in `chrome.storage.local`.

---

## Installation (Load Unpacked)

1. Open Chrome and navigate to `chrome://extensions`.
2. Turn ON **Developer mode** (top right switch).
3. Click **Load unpacked** (top left).
4. Select the `chrome-extension/` directory.
5. Click the extension icon or open the Side Panel to start using **JobPilot AI**.

---

## Setup & Configuration

1. Open the extension Settings (right-click icon → Options, or click the gear icon in the side panel).
2. Configure your LLM Provider:
   - **OpenRouter** (Claude 3.7 / 3.5 Sonnet, GPT-4o, etc.)
   - **Groq** (Llama 3.3 70B)
   - **OpenAI** (GPT-4o)
   - **Ollama** (Local AI on `http://localhost:11434/v1`)
   - **Custom** (any OpenAI-compatible endpoint)
3. Choose your **Automation Mode**:
   - `ASSISTED` (Default — AI fills safe fields; user reviews before submission)
   - `AUTO-SAFE` (AI fills low-risk fields, high-risk fields pause for human input)
   - `MANUAL` (AI suggests actions, user clicks each action)
4. Upload your Resume in the Side Panel (PDF, DOCX, TXT, or MD).

---

## Architecture

```
chrome-extension/
├── manifest.json                  — MV3 manifest, sidePanel permission, default_path
├── background.js                  — Service worker, tab registry, keepOpen protection
├── chat.html / chat.js            — JobPilot AI Side Panel interface
├── options.html / options.js      — Settings & Candidate Profile management
│
├── agent/
│   ├── llm.js                     — Multi-provider client (OpenRouter, Groq, OpenAI, Ollama)
│   ├── runner.js                  — Agent loop & tool dispatch
│   ├── scheduler.js               — Task automation & alarm management
│   └── tools.js                   — Low-level browser primitives + JobPilot AI tools
│
├── resume/
│   ├── resume.js                  — chrome.storage.local persistence (jobpilotResume)
│   ├── resume-parser.js           — PDF, DOCX, TXT, MD multi-format parser
│   └── profile.js                 — Truthful profile extraction from resume
│
├── job/
│   ├── job-analyzer.js            — Semantic DOM & JSON-LD JobPosting analyzer
│   └── job-fit.js                 — AI Fit Estimate calculator
│
├── application/
│   ├── form-analyzer.js           — DOM form field inspector & label resolver
│   ├── form-filler.js             — Event-driven form filling & value readback
│   ├── field-mapper.js            — Semantic mapping & HIGH_RISK_FIELDS rules
│   ├── screening.js               — Conversational answers & cover letter generator
│   ├── application-state.js       — Local applications tracker (jobpilotApplications)
│   └── adapters/                  — ATS Adapters (Greenhouse, Lever, Ashby, Workable, Workday, Generic)
│
├── profile/
│   └── profile.js                 — User profile management (jobpilotProfile)
│
├── ui/
│   ├── components.js              — Modular card & modal renderers
│   └── styles.css                 — Modern dark glassmorphic design system
│
└── vendor/
    ├── pdfjs/                     — Bundled local pdf.min.js & worker
    └── mammoth/                   — Bundled local mammoth.browser.min.js
```
