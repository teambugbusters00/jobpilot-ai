/**
 * application/adapters/index.js
 * Registry and resolver for ATS adapters.
 */

import { genericAdapter } from './generic.js'
import { greenhouseAdapter } from './greenhouse.js'
import { leverAdapter } from './lever.js'
import { ashbyAdapter } from './ashby.js'
import { workableAdapter } from './workable.js'
import { workdayAdapter } from './workday.js'

const ADAPTERS = [
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  workableAdapter,
  workdayAdapter,
  genericAdapter, // Must be last as fallback
]

export function resolveAdapter(url) {
  const matched = ADAPTERS.find(a => a.canHandle(url))
  return matched || genericAdapter
}
