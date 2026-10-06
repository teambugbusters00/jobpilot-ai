/**
 * application/adapters/greenhouse.js
 * Dedicated adapter for Greenhouse ATS job boards and embedded applications.
 */

import { analyzeJobPage } from '../../job/job-analyzer.js'
import { analyzeApplicationForm } from '../form-analyzer.js'

export const greenhouseAdapter = {
  name: 'greenhouse',

  canHandle(url) {
    return /greenhouse\.io|boards\.greenhouse\.io|gh_jid=/i.test(url)
  },

  async extractJob(tabId) {
    const job = await analyzeJobPage(tabId)
    // Greenhouse specific adjustments
    return {
      ...job,
      source: 'Greenhouse',
    }
  },

  async extractForm(tabId) {
    const form = await analyzeApplicationForm(tabId)
    // Identify greenhouse resume file input
    for (const f of form.fields) {
      if (f.id === 'resume' || f.name === 'resume' || (f.type === 'file' && /resume/i.test(f.label))) {
        f.semanticType = 'resume_upload'
      }
    }
    return form
  },
}
