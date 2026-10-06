/**
 * application/adapters/workday.js
 * Dedicated adapter for Workday application forms.
 */

import { analyzeJobPage } from '../../job/job-analyzer.js'
import { analyzeApplicationForm } from '../form-analyzer.js'

export const workdayAdapter = {
  name: 'workday',

  canHandle(url) {
    return /myworkdayjobs\.com|workday\.com/i.test(url)
  },

  async extractJob(tabId) {
    const job = await analyzeJobPage(tabId)
    return {
      ...job,
      source: 'Workday',
    }
  },

  async extractForm(tabId) {
    return await analyzeApplicationForm(tabId)
  },
}
