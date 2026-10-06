/**
 * application/adapters/lever.js
 * Dedicated adapter for Lever.co job boards and application forms.
 */

import { analyzeJobPage } from '../../job/job-analyzer.js'
import { analyzeApplicationForm } from '../form-analyzer.js'

export const leverAdapter = {
  name: 'lever',

  canHandle(url) {
    return /jobs\.lever\.co|lever\.co/i.test(url)
  },

  async extractJob(tabId) {
    const job = await analyzeJobPage(tabId)
    return {
      ...job,
      source: 'Lever',
    }
  },

  async extractForm(tabId) {
    const form = await analyzeApplicationForm(tabId)
    for (const f of form.fields) {
      if (f.name === 'resume' || (f.type === 'file' && /resume/i.test(f.label))) {
        f.semanticType = 'resume_upload'
      }
      if (f.name === 'name') f.semanticType = 'full_name'
      if (f.name === 'email') f.semanticType = 'email'
      if (f.name === 'phone') f.semanticType = 'phone'
      if (f.name === 'org') f.semanticType = 'current_company'
      if (f.name?.includes('urls[LinkedIn]')) f.semanticType = 'linkedin'
      if (f.name?.includes('urls[GitHub]')) f.semanticType = 'github'
      if (f.name?.includes('urls[Portfolio]')) f.semanticType = 'portfolio'
    }
    return form
  },
}
