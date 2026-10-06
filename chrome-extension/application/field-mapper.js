/**
 * application/field-mapper.js
 * Maps raw DOM labels/attributes into universal semantic fields,
 * and identifies HIGH_RISK_FIELDS that require mandatory human confirmation.
 */

export const HIGH_RISK_FIELDS = [
  'salary_expectation',
  'work_authorization',
  'visa_sponsorship',
  'sponsorship_required',
  'criminal_history',
  'disability_status',
  'gender',
  'race_ethnicity',
  'veteran_status',
  'legal_eligibility',
  'relocation_willingness',
  'background_check_consent',
]

export const SEMANTIC_PATTERNS = {
  first_name: [
    /first\s*name/i, /given\s*name/i, /forename/i, /^fname$/i, /^first$/i,
  ],
  last_name: [
    /last\s*name/i, /surname/i, /family\s*name/i, /^lname$/i, /^last$/i,
  ],
  full_name: [
    /^full\s*name$/i, /^your\s*name$/i, /^name$/i, /^candidate\s*name$/i,
  ],
  email: [
    /email/i, /e-mail/i,
  ],
  phone: [
    /phone/i, /mobile/i, /telephone/i, /contact\s*number/i, /cell/i,
  ],
  location: [
    /city/i, /current\s*location/i, /address/i, /country/i, /postal/i, /zip/i,
  ],
  linkedin: [
    /linkedin/i, /linked-in/i,
  ],
  github: [
    /github/i, /git\s*profile/i,
  ],
  portfolio: [
    /portfolio/i, /website/i, /personal\s*site/i, /blog/i,
  ],
  resume_upload: [
    /resume/i, /cv/i, /curriculum\s*vitae/i, /upload\s*(your\s*)?resume/i,
  ],
  cover_letter: [
    /cover\s*letter/i, /letter\s*of\s*motivation/i,
  ],
  current_company: [
    /current\s*company/i, /employer/i, /current\s*employer/i,
  ],
  current_title: [
    /current\s*title/i, /current\s*role/i, /current\s*job/i,
  ],
  education_degree: [
    /degree/i, /highest\s*education/i, /university/i, /college/i, /school/i,
  ],
  graduation_year: [
    /graduat(ion|ed)\s*(year|date)/i, /end\s*year/i,
  ],
  motivation: [
    /why\s*(do\s*you\s*want\s*to\s*work|this\s*company|join|us|here)/i,
    /what\s*excites\s*you/i,
    /motivation/i,
  ],
  experience_summary: [
    /tell\s*(us|me)\s*about\s*yourself/i,
    /summary/i,
    /brief\s*bio/i,
    /describe\s*(your\s*)?experience/i,
  ],

  // ── High risk patterns ──
  salary_expectation: [
    /salary/i, /compensation/i, /desired\s*pay/i, /expected\s*ctc/i, /hourly\s*rate/i,
  ],
  work_authorization: [
    /authorized\s*to\s*work/i, /legally\s*authorized/i, /work\s*permit/i, /eligib(le|ility)\s*to\s*work/i,
  ],
  visa_sponsorship: [
    /sponsorship/i, /require\s*visa/i, /need\s*visa/i, /h1b/i, /future\s*sponsorship/i,
  ],
  disability_status: [
    /disability/i, /physical\s*limitation/i, /handicap/i,
  ],
  veteran_status: [
    /veteran/i, /military\s*service/i, /armed\s*forces/i,
  ],
  gender: [
    /gender/i, /sex\b/i,
  ],
  race_ethnicity: [
    /race/i, /ethnicity/i, /hispanic/i, /latino/i,
  ],
  criminal_history: [
    /felony/i, /convict(ed|ion)/i, /criminal/i,
  ],
  relocation_willingness: [
    /willing\s*to\s*relocate/i, /relocat(e|ion)/i,
  ],
}

/**
 * Determine semantic field type for a given form element's signals.
 * @param {object} field
 * @returns {{ semanticType: string, isHighRisk: boolean }}
 */
export function mapFieldSemantics(field) {
  const haystack = [
    field.label || '',
    field.name || '',
    field.id || '',
    field.placeholder || '',
    field.ariaLabel || '',
  ].join(' ').toLowerCase()

  for (const [type, patterns] of Object.entries(SEMANTIC_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(haystack)) {
        const isHighRisk = HIGH_RISK_FIELDS.includes(type)
        return { semanticType: type, isHighRisk }
      }
    }
  }

  // Type-based fallbacks
  if (field.type === 'email') return { semanticType: 'email', isHighRisk: false }
  if (field.type === 'tel') return { semanticType: 'phone', isHighRisk: false }
  if (field.type === 'file' && /resume|cv/i.test(haystack)) {
    return { semanticType: 'resume_upload', isHighRisk: false }
  }

  return { semanticType: 'unknown', isHighRisk: false }
}
