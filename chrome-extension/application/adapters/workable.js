/**
 * application/adapters/workable.js
 * Dedicated adapter for Workable job postings.
 */

import { analyzeJobPage } from '../../job/job-analyzer.js'
import { analyzeApplicationForm } from '../form-analyzer.js'

export const workableAdapter = {
  name: 'workable',

  canHandle(url) {
    return /apply\.workable\.com|workable\.com/i.test(url)
  },

  async extractJob(tabId) {
    const job = await analyzeJobPage(tabId)
    return {
      ...job,
      source: 'Workable',
    }
  },

  async extractForm(tabId) {
    return await analyzeApplicationForm(tabId)
  },
}
