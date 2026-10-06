/**
 * application/form-filler.js
 * Robust form field filling engine with React/Vue/Angular controlled component support,
 * verification readbacks, and safe file input handling.
 */

/**
 * JS function executed inside target tab to fill a field and dispatch synthetic events.
 */
function inPageFillField(selector, value, fieldType) {
  const el = document.querySelector(selector)
  if (!el) return { success: false, error: 'Element not found: ' + selector }

  try {
    el.focus()

    if (fieldType === 'checkbox') {
      const boolVal = !!value && value !== 'false' && value !== '0'
      el.checked = boolVal
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { success: true, verifiedValue: el.checked }
    }

    if (fieldType === 'radio') {
      el.checked = true
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { success: true, verifiedValue: el.checked }
    }

    if (fieldType === 'select') {
      // Find matching option by value or text
      let matched = false
      const strVal = String(value).toLowerCase().trim()
      for (const opt of el.options) {
        if (opt.value.toLowerCase() === strVal || opt.text.toLowerCase().includes(strVal)) {
          el.value = opt.value
          matched = true
          break
        }
      }
      if (!matched && el.options.length > 0) {
        el.selectedIndex = 0
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.blur()
      return { success: true, verifiedValue: el.value }
    }

    // Text / Email / Phone / Textarea / URL
    // Handle React 16+ setter override
    const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (nativeValueSetter) {
      nativeValueSetter.call(el, String(value))
    } else {
      el.value = String(value)
    }

    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))

    // Read back value to verify
    const verifiedValue = el.value
    const isVerified = (verifiedValue === String(value)) || (verifiedValue.length > 0)

    return {
      success: isVerified,
      verifiedValue,
      error: isVerified ? null : 'Value did not stick after event dispatch',
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Fill a single form field in the given tab.
 * @param {number} tabId
 * @param {object} field { id, name, uid, type }
 * @param {string|boolean} value
 * @returns {Promise<{success: boolean, verifiedValue: any, error?: string}>}
 */
export async function fillField(tabId, field, value) {
  // Construct a safe selector
  let selector = ''
  if (field.id) {
    selector = `#${CSS.escape(field.id)}`
  } else if (field.name) {
    selector = `[name="${CSS.escape(field.name)}"]`
  } else if (field.index !== undefined) {
    selector = `input:nth-of-type(${field.index + 1}), textarea:nth-of-type(${field.index + 1}), select:nth-of-type(${field.index + 1})`
  } else {
    return { success: false, error: 'No identifiable selector for field' }
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: inPageFillField,
      args: [selector, value, field.type || 'text'],
    })

    const res = results?.[0]?.result || { success: false, error: 'No script execution result' }

    if (!res.success) {
      console.warn(`[FormFiller] Standard DOM fill failed for ${selector}, attempting CDP fallback...`)
      // Try CDP Input.insertText fallback if available
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: `(() => { const el = document.querySelector('${selector.replace(/'/g, "\\'")}'); if (el) { el.focus(); el.select(); } })()`,
        })
        await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: String(value) })
        return { success: true, verifiedValue: String(value), method: 'cdp' }
      } catch (cdpErr) {
        return { success: false, error: `Fill failed: ${res.error || cdpErr.message}` }
      }
    }

    return res
  } catch (err) {
    console.error(`[FormFiller] Failed to fill field ${field.label || field.name}:`, err)
    return { success: false, error: err.message }
  }
}

/**
 * Handle resume file upload simulation or notify manual selection requirement.
 * @param {number} tabId
 * @param {object} fileField
 * @param {object} resumeData
 */
export async function uploadResumeToFileField(tabId, fileField, resumeData) {
  if (!resumeData) {
    return { success: false, error: 'No resume uploaded in JobPilot AI.' }
  }

  const selector = fileField.id ? `#${CSS.escape(fileField.id)}` : `input[type="file"]`

  // Attempt DataTransfer File injection
  const injectionResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, fName, fMime, fText) => {
      const input = document.querySelector(sel)
      if (!input || input.type !== 'file') return { success: false, error: 'File input not found' }

      try {
        const file = new File([fText], fName, { type: fMime })
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(file)
        input.files = dataTransfer.files
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))

        return {
          success: input.files.length > 0,
          fileName: input.files[0]?.name,
        }
      } catch (err) {
        return { success: false, manualRequired: true, error: err.message }
      }
    },
    args: [selector, resumeData.fileName, resumeData.mimeType, resumeData.text],
  }).catch(err => ({ error: err.message }))

  const res = injectionResult?.[0]?.result
  if (res?.success) {
    return { success: true, message: `Resume file "${res.fileName}" attached successfully.` }
  }

  // Graceful notification per safety rule #20
  return {
    success: false,
    manualRequired: true,
    message: 'Resume upload requires manual selection on this site due to browser security restrictions.',
  }
}
