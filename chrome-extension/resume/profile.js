/**
 * resume/profile.js
 * Derives structured profile information ONLY from the uploaded resume text.
 * Strictly adheres to truthfulness rules — never fabricates missing details.
 */

/**
 * Extracts structured profile fields from raw resume text.
 * @param {string} text
 * @returns {object} structured profile
 */
export function extractProfileFromResumeText(text) {
  if (!text || typeof text !== 'string') {
    return createEmptyProfile()
  }

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)

  const profile = createEmptyProfile()

  // 1. Personal details extraction
  profile.personal.email = extractEmail(text)
  profile.personal.phone = extractPhone(text)
  profile.personal.linkedin = extractLinkedIn(text)
  profile.personal.github = extractGitHub(text)
  profile.personal.portfolio = extractPortfolio(text, [profile.personal.linkedin, profile.personal.github])
  profile.personal.name = extractCandidateName(lines, text)
  profile.personal.location = extractLocation(lines)

  // 2. Section extraction
  const sections = splitSections(lines)

  if (sections.skills) {
    profile.skills = parseSkills(sections.skills)
  }
  if (sections.education) {
    profile.education = parseEducation(sections.education)
  }
  if (sections.experience) {
    profile.experience = parseExperience(sections.experience)
  }
  if (sections.projects) {
    profile.projects = parseProjects(sections.projects)
  }
  if (sections.certifications) {
    profile.certifications = parseCertifications(sections.certifications)
  }
  if (sections.achievements) {
    profile.achievements = parseBulletList(sections.achievements)
  }
  if (sections.languages) {
    profile.languages = parseLanguages(sections.languages)
  }

  return profile
}

export function createEmptyProfile() {
  return {
    personal: {
      name: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      portfolio: '',
    },
    education: [],
    experience: [],
    projects: [],
    skills: [],
    certifications: [],
    achievements: [],
    languages: [],
  }
}

// ─── Extraction Heuristics ─────────────────────────────────────────────────────

function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  return match ? match[0] : ''
}

function extractPhone(text) {
  const match = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)
  return match ? match[0].trim() : ''
}

function extractLinkedIn(text) {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|profile)\/[a-zA-Z0-9_-]+/i)
  return match ? (match[0].startsWith('http') ? match[0] : `https://${match[0]}`) : ''
}

function extractGitHub(text) {
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i)
  return match ? (match[0].startsWith('http') ? match[0] : `https://${match[0]}`) : ''
}

function extractPortfolio(text, excludeUrls = []) {
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.(?:dev|me|io|com|org|ai|tech|app))(?:\/[^\s)]*)?/gi
  let match
  while ((match = urlRegex.exec(text)) !== null) {
    const candidate = match[0]
    if (!excludeUrls.some(u => u && candidate.toLowerCase().includes(u.toLowerCase())) &&
        !candidate.includes('linkedin.com') &&
        !candidate.includes('github.com') &&
        !candidate.includes('google.com')) {
      return candidate.startsWith('http') ? candidate : `https://${candidate}`
    }
  }
  return ''
}

function extractCandidateName(lines, rawText) {
  // First 1-3 non-empty lines usually have candidate's name
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i]
    // Clean up
    if (line.includes('@') || line.includes('http') || line.includes('Page ') || line.length > 50) continue
    if (/^[A-Z][a-zA-Z.'-]+(\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(line)) {
      return line
    }
  }
  if (lines.length > 0 && lines[0].length < 40 && !lines[0].includes('@')) {
    return lines[0].replace(/[^a-zA-Z\s.'-]/g, '').trim()
  }
  return ''
}

function extractLocation(lines) {
  const locRegex = /([A-Z][a-zA-Z]+(?:[\s-][A-Z][a-zA-Z]+)*),\s*([A-Z]{2}|[A-Z][a-zA-Z]+)/
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const match = lines[i].match(locRegex)
    if (match && !lines[i].includes('@') && !lines[i].includes('http')) {
      return match[0].trim()
    }
  }
  return ''
}

function splitSections(lines) {
  const headers = {
    skills: /^(technical\s+)?skills|technologies|tools|competencies/i,
    education: /^education|academic\s+background|qualifications/i,
    experience: /^(work\s+|professional\s+)?experience|employment|work\s+history/i,
    projects: /^(featured\s+|academic\s+)?projects|personal\s+projects/i,
    certifications: /^certifications?|licenses|courses/i,
    achievements: /^achievements|awards|honors|extracurricular/i,
    languages: /^languages/i,
  }

  const sections = {}
  let currentSection = null

  for (const line of lines) {
    let matchedHeader = null
    for (const [key, regex] of Object.entries(headers)) {
      if (regex.test(line) && line.split(/\s+/).length <= 4) {
        matchedHeader = key
        break
      }
    }

    if (matchedHeader) {
      currentSection = matchedHeader
      if (!sections[currentSection]) sections[currentSection] = []
    } else if (currentSection) {
      sections[currentSection].push(line)
    }
  }

  return sections
}

function parseSkills(lines) {
  const skillsSet = new Set()
  for (const line of lines) {
    const clean = line.replace(/^(Languages|Frameworks|Tools|Databases|Libraries|Platforms|Cloud):\s*/i, '')
    const parts = clean.split(/[,•|/·;]/).map(s => s.trim())
    for (const p of parts) {
      if (p.length > 1 && p.length < 35 && !p.startsWith('http')) {
        skillsSet.add(p)
      }
    }
  }
  return Array.from(skillsSet)
}

function parseEducation(lines) {
  const eduItems = []
  let current = null
  for (const line of lines) {
    if (/(bachelor|master|b\.?s|m\.?s|b\.?tech|m\.?tech|phd|associate|degree|university|college|institute)/i.test(line)) {
      if (current) eduItems.push(current)
      current = { institution: '', degree: line, year: '' }
    } else if (current) {
      const yearMatch = line.match(/\b(20\d{2}|19\d{2})\b/)
      if (yearMatch && !current.year) current.year = yearMatch[0]
      if (!current.institution && line.length < 70) current.institution = line
    }
  }
  if (current) eduItems.push(current)
  return eduItems
}

function parseExperience(lines) {
  const items = []
  let current = null
  for (const line of lines) {
    const isHeader = /(engineer|developer|intern|lead|analyst|manager|consultant|specialist|assistant)/i.test(line) &&
      line.split(/\s+/).length <= 8
    if (isHeader) {
      if (current) items.push(current)
      current = { title: line, company: '', period: '', bullets: [] }
    } else if (current) {
      const dateMatch = line.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20\d\d).*?(?:Present|20\d\d)/i)
      if (dateMatch && !current.period) {
        current.period = dateMatch[0]
      } else if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        current.bullets.push(line.replace(/^[•\-*]\s*/, ''))
      } else if (!current.company && line.length < 50) {
        current.company = line
      } else {
        current.bullets.push(line)
      }
    }
  }
  if (current) items.push(current)
  return items
}

function parseProjects(lines) {
  const projects = []
  let current = null
  for (const line of lines) {
    if ((line.startsWith('•') || line.startsWith('-')) && current) {
      current.bullets.push(line.replace(/^[•\-*]\s*/, ''))
    } else if (line.length < 60 && !line.includes('.')) {
      if (current) projects.push(current)
      current = { name: line, bullets: [], link: '' }
    } else if (current) {
      if (line.includes('http')) current.link = extractPortfolio(line)
      else current.bullets.push(line)
    }
  }
  if (current) projects.push(current)
  return projects
}

function parseCertifications(lines) {
  return lines.map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean)
}

function parseBulletList(lines) {
  return lines.map(l => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean)
}

function parseLanguages(lines) {
  const joined = lines.join(', ')
  return joined.split(/[,•|/·;]/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 25)
}
