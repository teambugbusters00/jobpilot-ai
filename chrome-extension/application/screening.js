/**
 * application/screening.js
 * Generates human-like, truthful answers to application and screening questions.
 * Strictly adheres to non-fabrication safety rules.
 */

import { chatCompletion, loadLLMConfig } from '../agent/llm.js'

export const NATURAL_ANSWER_SYSTEM_PROMPT = `You are helping the user answer a job application.
Write in natural conversational English.
Sound like a real early-career software engineer.
Do not sound robotic.
Avoid generic corporate filler.
Avoid unnecessary buzzwords.
Use specific details from the user's real experience.
Do not invent facts.
Do not claim skills that are not supported by the user's profile or resume.
Keep answers proportional to the question.
For simple fields, answer simply.
For open-ended questions, write concise but specific responses (usually 2-4 sentences unless requested otherwise).
Never claim something the user has not actually done.
If the question asks for confidential legal, salary, or unknown personal details that are not in the profile or resume, state clearly: "NEEDS_USER_INPUT: [reason]".`

/**
 * Generate a truthful, tailored answer to a specific question.
 * @param {string} question
 * @param {object} context { job, resume, profile }
 * @returns {Promise<{ answer: string, needsUserInput: boolean, reason?: string }>}
 */
export async function generateQuestionAnswer(question, { job, resume, profile }) {
  const config = await loadLLMConfig()

  const userContext = [
    `QUESTION: "${question}"`,
    job ? `TARGET JOB: ${job.title || ''} at ${job.company || ''}` : '',
    job?.description ? `JOB DESCRIPTION SNIPPET: ${job.description.slice(0, 1500)}` : '',
    profile ? `VERIFIED USER PROFILE: ${JSON.stringify(profile)}` : '',
    resume?.text ? `VERIFIED RESUME TEXT: ${resume.text.slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n\n')

  const messages = [
    { role: 'system', content: NATURAL_ANSWER_SYSTEM_PROMPT },
    { role: 'user', content: `Please draft a natural, honest answer to this application question based strictly on my verified background:\n\n${userContext}` }
  ]

  try {
    const { message } = await chatCompletion(messages, [], config)
    const raw = (message.content || '').trim()

    if (raw.startsWith('NEEDS_USER_INPUT:')) {
      return {
        answer: '',
        needsUserInput: true,
        reason: raw.replace('NEEDS_USER_INPUT:', '').trim(),
      }
    }

    return {
      answer: raw,
      needsUserInput: false,
    }
  } catch (err) {
    console.error('[ScreeningEngine] Answer generation failed:', err)
    return {
      answer: '',
      needsUserInput: true,
      reason: `Could not generate answer automatically: ${err.message}`,
    }
  }
}

/**
 * Generate a natural, tailored cover letter based strictly on verified experience.
 * @param {object} param0 { job, resume, profile }
 * @returns {Promise<string>}
 */
export async function generateCoverLetter({ job, resume, profile }) {
  const config = await loadLLMConfig()

  const prompt = `Write a concise, compelling cover letter (3 short paragraphs) for the following role:
Role: ${job?.title || 'Software Engineer'}
Company: ${job?.company || 'The Hiring Team'}
Key Job Requirements: ${(job?.requirements || []).slice(0, 5).join('; ') || job?.description?.slice(0, 500)}

Candidate Profile:
Name: ${profile?.personal?.name || 'Applicant'}
Verified Experience: ${JSON.stringify(profile?.experience || [])}
Verified Projects: ${JSON.stringify(profile?.projects || [])}
Verified Skills: ${(profile?.skills || []).join(', ')}

Tone Guidelines:
- Natural, conversational, confident.
- Early-career software engineer who likes building practical systems.
- Highlight 1-2 real relevant projects or experiences from the candidate data.
- NO corporate jargon ("synergy", "dynamic environment", "incredibly passionate").
- Truthful only.`

  const messages = [
    { role: 'system', content: NATURAL_ANSWER_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  const { message } = await chatCompletion(messages, [], config)
  return (message.content || '').trim()
}

/**
 * Tailor resume bullet points truthfully for the target job.
 * @param {object} param0 { job, resume, profile }
 * @returns {Promise<object>} Tailored resume text & highlights
 */
export async function tailorResumeContent({ job, resume, profile }) {
  const config = await loadLLMConfig()

  const prompt = `Review the candidate's existing resume bullets and rephrase/reorder them to highlight relevance for this job.
Job Title: ${job?.title || ''}
Technologies desired: ${(job?.technologies || []).join(', ')}
Original Resume Text:
${resume?.text?.slice(0, 3500) || ''}

STRICT SAFETY RULES:
- DO NOT invent any metrics, companies, or tools.
- DO NOT add technologies that the candidate hasn't used.
- Only emphasize and rephrase existing real achievements.
- Provide a clear, clean markdown version of the tailored resume.`

  const messages = [
    { role: 'system', content: NATURAL_ANSWER_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  const { message } = await chatCompletion(messages, [], config)
  return {
    tailoredText: (message.content || '').trim(),
    originalText: resume?.text || '',
  }
}

/**
 * Generate a referral outreach message for LinkedIn / email networking.
 * @param {object} param0 { job, resume, profile }
 * @returns {Promise<string>}
 */
export async function generateReferralOutreach({ job, resume, profile }) {
  const config = await loadLLMConfig()

  const prompt = `Write a short, polite LinkedIn or email networking message (under 120 words) to an engineer or alumnus at ${job?.company || 'the company'}.
Position of interest: ${job?.title || 'Open Role'}
Candidate Name: ${profile?.personal?.name || 'Applicant'}
Candidate Background: ${profile?.currentRole || 'Student / Early Career Engineer'} with background in ${(profile?.skills || []).slice(0, 3).join(', ')}

Tone:
- Respectful of their time.
- Friendly, authentic, humble.
- Ask for 5-10 minutes to learn about the team or ask if they'd be open to referring.`

  const messages = [
    { role: 'system', content: NATURAL_ANSWER_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  const { message } = await chatCompletion(messages, [], config)
  return (message.content || '').trim()
}

/**
 * Generate role-specific interview preparation questions & answers (Jobright Interview Coaching).
 * @param {object} param0 { job, resume, profile }
 * @returns {Promise<string>}
 */
export async function generateInterviewQuestions({ job, resume, profile }) {
  const config = await loadLLMConfig()

  const prompt = `Prepare the top 4 most probable interview questions for this specific role:
Role: ${job?.title || 'Software Engineer'}
Company: ${job?.company || 'Company'}
Required Tech: ${(job?.technologies || []).join(', ') || 'Software Development'}

Candidate Background:
Skills: ${(profile?.skills || []).slice(0, 5).join(', ')}
Experience: ${JSON.stringify((profile?.experience || []).slice(0, 2))}

Provide:
1. Two Behavioral Questions (e.g. teamwork, overcoming technical roadblock) + brief suggested talking points.
2. Two Technical/Domain Questions tailored to ${job?.technologies?.[0] || 'the role'} + key concepts to mention.
Keep answers concise, realistic, and practical.`

  const messages = [
    { role: 'system', content: NATURAL_ANSWER_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  const { message } = await chatCompletion(messages, [], config)
  return (message.content || '').trim()
}

/**
 * Generate quick company overview and insights.
 * @param {object} param0 { job }
 * @returns {Promise<string>}
 */
export async function generateCompanyInsights({ job }) {
  const config = await loadLLMConfig()

  const prompt = `Provide a concise company brief for "${job?.company || 'The Hiring Organization'}":
1. What does the company do and their primary industry?
2. Typical engineering culture and tech stack focus?
3. Tips for standing out in their hiring process?
Keep it under 150 words.`

  const messages = [
    { role: 'system', content: NATURAL_ANSWER_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  const { message } = await chatCompletion(messages, [], config)
  return (message.content || '').trim()
}


