/**
 * job/job-fit.js
 * Calculates the rich Jobright-style "AI Fit Estimate" and multi-factor match breakdown:
 * - Overall Match Score & Rating (e.g., 91% STRONG MATCH)
 * - Experience Level Match %
 * - Skill Match %
 * - Education Match %
 * - H1B / Visa Sponsorship Likelihood
 * - Strengths, Missing Skills, and Actionable Recommendations
 */

/**
 * Calculate job match score and breakdown modeled on Jobright AI fit analysis.
 * @param {object} job
 * @param {object} resume
 * @param {object} profile
 * @returns {object} Comprehensive Fit score breakdown
 */
export function calculateJobFit(job, resume, profile) {
  if (!job) {
    return {
      overallScore: 0,
      matchRating: 'NO DATA',
      experienceLevelScore: 0,
      skillsScore: 0,
      educationScore: 0,
      h1bLikelihood: 'Unknown',
      strengths: [],
      weaknesses: [],
      missingSkills: [],
      matchedSkills: [],
      recommendations: ['Open a job posting tab and click Analyze Job.'],
      label: 'AI Fit Estimate',
    }
  }

  const resumeText = (resume?.text || '').toLowerCase()
  const candidateSkills = new Set([
    ...(profile?.skills || []).map(s => s.toLowerCase()),
    ...(extractSkillsFromText(resumeText)),
  ])

  // 1. Skill Match Calculation
  const jobTechs = (job.technologies || []).map(t => t.toLowerCase())
  const matchedSkills = []
  const missingSkills = []

  if (jobTechs.length > 0) {
    for (const tech of jobTechs) {
      if (candidateSkills.has(tech) || resumeText.includes(tech)) {
        matchedSkills.push(tech)
      } else {
        missingSkills.push(tech)
      }
    }
  }

  const skillsScore = jobTechs.length === 0
    ? 82
    : Math.max(30, Math.min(98, Math.round((matchedSkills.length / jobTechs.length) * 100)))

  // 2. Education Match Calculation
  let educationScore = 80
  const reqText = (job.requirements || []).join(' ').toLowerCase() + ' ' + (job.description || '').toLowerCase()
  const hasDegreeReq = /bachelor|master|b\.?s|degree|b\.?tech/i.test(reqText)
  const candidateHasDegree = (profile?.education || []).length > 0 ||
    /bachelor|master|b\.?s|university|college|b\.?tech/i.test(resumeText)

  if (hasDegreeReq && candidateHasDegree) educationScore = 100
  else if (!hasDegreeReq && candidateHasDegree) educationScore = 95
  else if (hasDegreeReq && !candidateHasDegree) educationScore = 65
  else educationScore = 85

  // 3. Experience Level Match Calculation
  let experienceLevelScore = 78
  const jobTitle = (job.title || '').toLowerCase()
  const experiences = profile?.experience || []
  const isInternshipJob = /intern|internship|co-op|student/i.test(jobTitle + ' ' + (job.employmentType || ''))

  if (isInternshipJob) {
    experienceLevelScore = candidateHasDegree || experiences.length > 0 ? 88 : 70
  } else if (experiences.length >= 2) {
    experienceLevelScore = 92
  } else if (experiences.length === 1) {
    experienceLevelScore = 84
  } else {
    experienceLevelScore = 70
  }

  // 4. Overall Weighted Score
  const overallScore = Math.min(98, Math.max(25, Math.round(
    experienceLevelScore * 0.40 +
    skillsScore * 0.40 +
    educationScore * 0.20
  )))

  // Rating label (Jobright style: STRONG MATCH, GOOD MATCH, MODERATE MATCH)
  let matchRating = 'MODERATE MATCH'
  if (overallScore >= 85) matchRating = 'STRONG MATCH'
  else if (overallScore >= 70) matchRating = 'GOOD MATCH'
  else if (overallScore >= 50) matchRating = 'FAIR MATCH'
  else matchRating = 'LOW MATCH'

  // 5. Visa / H1B Sponsorship Likelihood
  let h1bLikelihood = 'H1B Sponsor Likely'
  const companyLower = (job.company || '').toLowerCase()
  const descLower = (job.description || '').toLowerCase()

  if (/visa sponsorship (is )?not available|will not sponsor|u\.s\. citizenship required/i.test(descLower)) {
    h1bLikelihood = 'No Sponsorship'
  } else if (/mckinsey|google|meta|amazon|microsoft|apple|goldman|uber|bloomberg|netflix/i.test(companyLower)) {
    h1bLikelihood = 'H1B Sponsor Likely'
  } else if (/sponsor|h1-b|h1b/i.test(descLower)) {
    h1bLikelihood = 'H1B Sponsorship Available'
  } else {
    h1bLikelihood = 'Sponsorship Policy Varies'
  }

  // 6. Detailed Strengths, Weaknesses, Recommendations
  const strengths = []
  const weaknesses = []
  const recommendations = []

  if (matchedSkills.length > 0) {
    strengths.push(`Matches ${matchedSkills.length} core technical competencies: ${matchedSkills.slice(0, 4).join(', ')}`)
  }
  if (educationScore >= 90) {
    strengths.push('Educational background strictly fulfills or exceeds position criteria.')
  }
  if (experienceLevelScore >= 80) {
    strengths.push('Career level and past project scopes align with role expectations.')
  }

  if (missingSkills.length > 0) {
    weaknesses.push(`Job mentions ${missingSkills.slice(0, 4).join(', ')}, which are not explicitly highlighted on your resume.`)
    recommendations.push(`Use 'Customize Your Resume' to weave relevant coursework or project usage of ${missingSkills.slice(0, 2).join(' and ')} into your bullet points.`)
  }

  recommendations.push('Generate a tailored Cover Letter highlighting your direct relevance to this specific role.')

  return {
    overallScore,
    matchRating,
    experienceLevelScore,
    skillsScore,
    educationScore,
    h1bLikelihood,
    earlyApplicant: true,
    matchedSkills,
    missingSkills,
    strengths,
    weaknesses,
    recommendations,
    label: 'AI Fit Estimate',
  }
}

function extractSkillsFromText(text) {
  const common = [
    'python', 'javascript', 'typescript', 'react', 'node.js', 'next.js', 'go', 'golang',
    'java', 'c++', 'rust', 'docker', 'kubernetes', 'aws', 'gcp', 'sql', 'postgresql',
    'mongodb', 'redis', 'graphql', 'rest', 'git', 'linux', 'pytorch', 'tensorflow', 'llm'
  ]
  return common.filter(s => text.includes(s))
}
