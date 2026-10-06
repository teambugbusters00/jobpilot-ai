/**
 * application/adapters/ashby.js
 * Dedicated adapter for AshbyHQ job applications.
 */

import { analyzeJobPage } from '../../job/job-analyzer.js'
import { analyzeApplicationForm } from '../form-analyzer.js'

export const ashbyAdapter = {
  name: 'ashby',

  canHandle(url) {
    return /jobs\.ashbyhq\.com|ashbyhq\.com/i.test(url)
  },

  async extractJob(tabId) {
    const job = await analyzeJobPage(tabId)
    return {
      ...job,
      source: 'Ashby',
    }
  },

  async extractForm(tabId) {
    return await analyzeApplicationForm(tabId)
  },
}
