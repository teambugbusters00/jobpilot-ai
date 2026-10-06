/**
 * application/form-analyzer.js
 * Comprehensive form inspection across active tab.
 * Extracts inputs, textareas, selects, radio, checkboxes, file uploads with semantic mapping.
 */

import { mapFieldSemantics } from './field-mapper.js'

/**
 * JS code injected into target tab to detect all interactive form fields.
 */
export const ANALYZE_FORM_SCRIPT = `(() => {
  const fields = [];
  const processed = new Set();

  function getElementLabel(el) {
    // 1. Label with for attribute
    if (el.id) {
      const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl && lbl.innerText.trim()) return lbl.innerText.trim();
    }

    // 2. Enclosing label
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(e => e.remove());
      const text = clone.innerText.trim();
      if (text) return text;
    }

    // 3. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // 4. aria-labelledby
    const ariaLabelledby = el.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      const target = document.getElementById(ariaLabelledby);
      if (target && target.innerText.trim()) return target.innerText.trim();
    }

    // 5. Placeholder
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();

    // 6. Closest field container heading or label
    const container = el.closest('.field, .form-group, .input-container, [data-field], [class*="field"], [class*="form"]');
    if (container) {
      const title = container.querySelector('label, [class*="label"], [class*="title"], h3, h4, span');
      if (title && title !== el && title.innerText.trim() && title.innerText.trim().length < 80) {
        return title.innerText.trim();
      }
    }

    // 7. Previous sibling text
    let prev = el.previousElementSibling;
    while (prev) {
      if (prev.innerText && prev.innerText.trim().length > 0 && prev.innerText.trim().length < 80) {
        return prev.innerText.trim();
      }
      prev = prev.previousElementSibling;
    }

    return el.name || el.id || '';
  }

  const elements = document.querySelectorAll('input, textarea, select');
  elements.forEach((el, index) => {
    // Skip hidden or button-like inputs
    const type = (el.type || el.tagName.toLowerCase()).toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') return;
    if (el.offsetParent === null && type !== 'file') return; // skip invisible elements, keep hidden file inputs

    const uid = el.id || el.name || ('jobpilot_field_' + index);
    if (processed.has(uid)) return;
    processed.add(uid);

    const label = getElementLabel(el);
    const options = el.tagName.toLowerCase() === 'select'
      ? Array.from(el.options).map(o => ({ value: o.value, text: o.text.trim() }))
      : [];

    fields.push({
      index,
      id: el.id || '',
      name: el.name || '',
      uid,
      tagName: el.tagName.toLowerCase(),
      type,
      label,
      placeholder: el.placeholder || '',
      required: !!(el.required || el.getAttribute('aria-required') === 'true' || label.includes('*')),
      currentValue: el.value || '',
      options,
      checked: !!el.checked,
      disabled: !!el.disabled,
    });
  });

  return {
    fields,
    pageTitle: document.title,
    url: window.location.href,
    hasSubmitButton: !!document.querySelector('button[type="submit"], input[type="submit"], button.submit, [data-testid="submit-button"]'),
  };
})()`;

/**
 * Analyze all application form fields on given tab.
 * @param {number} tabId
 * @returns {Promise<object>}
 */
export async function analyzeApplicationForm(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const code = ANALYZE_FORM_SCRIPT;
        return eval(code);
      },
    });

    const rawData = results?.[0]?.result || { fields: [] }

    // Map semantic attributes
    const enrichedFields = (rawData.fields || []).map(f => {
      const { semanticType, isHighRisk } = mapFieldSemantics(f)
      return {
        ...f,
        semanticType,
        isHighRisk,
      }
    })

    const highRiskCount = enrichedFields.filter(f => f.isHighRisk).length
    const safeCount = enrichedFields.filter(f => !f.isHighRisk && f.semanticType !== 'unknown').length

    return {
      fields: enrichedFields,
      hasSubmitButton: rawData.hasSubmitButton,
      url: rawData.url,
      pageTitle: rawData.pageTitle,
      totalCount: enrichedFields.length,
      highRiskCount,
      safeCount,
      unknownCount: enrichedFields.filter(f => f.semanticType === 'unknown').length,
    }
  } catch (err) {
    console.error('[FormAnalyzer] Failed to analyze application form:', err)
    return {
      fields: [],
      error: err.message,
      totalCount: 0,
      highRiskCount: 0,
      safeCount: 0,
    }
  }
}
