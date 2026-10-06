/**
 * application/adapters/generic.js
 * Universal fallback adapter using semantic DOM and accessibility heuristics.
 */

import { analyzeJobPage } from '../../job/job-analyzer.js'
import { analyzeApplicationForm } from '../form-analyzer.js'

export const genericAdapter = {
  name: 'generic',

  canHandle(url) {
    return true // Always handles as fallback
  },

  async extractJob(tabId) {
    return await analyzeJobPage(tabId)
  },

  async extractForm(tabId) {
    return await analyzeApplicationForm(tabId)
  },
}
