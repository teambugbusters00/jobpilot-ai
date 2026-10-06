/**
 * job/job-analyzer.js
 * Analyzes the job posting page on the active tab using semantic DOM inspection
 * and JSON-LD structured data extraction.
 */

/**
 * JS code evaluated in the page to extract raw job information.
 */
export const EXTRACT_JOB_SCRIPT = `(() => {
  const result = {
    title: '',
    company: '',
    location: '',
    workMode: 'Unknown',
    employmentType: 'Full-time',
    description: '',
    responsibilities: [],
    requirements: [],
    technologies: [],
    url: window.location.href,
    source: window.location.hostname
  };

  // 1. Check for JSON-LD JobPosting schema
  const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  for (const s of jsonLdScripts) {
    try {
      const data = JSON.parse(s.textContent.trim());
      const item = data['@graph'] ? data['@graph'].find(x => x['@type'] === 'JobPosting') : (data['@type'] === 'JobPosting' ? data : null);
      if (item) {
        result.title = item.title || '';
        result.company = item.hiringOrganization?.name || '';
        result.location = item.jobLocation?.address?.addressLocality || (typeof item.jobLocation?.address === 'string' ? item.jobLocation.address : '');
        result.description = item.description ? item.description.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim() : '';
        result.employmentType = item.employmentType || result.employmentType;
        if (item.jobLocationType === 'TELECOMMUTE' || /remote/i.test(JSON.stringify(item))) {
          result.workMode = 'Remote';
        }
        break;
      }
    } catch {}
  }

  // 2. ATS and Site-Specific Fallbacks
  const host = window.location.hostname.toLowerCase();

  // Greenhouse
  if (host.includes('greenhouse.io') || document.querySelector('#app_body, #content')) {
    result.title = result.title || document.querySelector('.app-title, h1.headline, h1')?.innerText?.trim() || '';
    result.company = result.company || document.querySelector('.company-name')?.innerText?.trim() || '';
    result.location = result.location || document.querySelector('.location')?.innerText?.trim() || '';
  }

  // Lever
  if (host.includes('lever.co') || document.querySelector('.posting-headline')) {
    result.title = result.title || document.querySelector('.posting-headline h2, h2')?.innerText?.trim() || '';
    result.company = result.company || document.querySelector('.main-header-logo img')?.alt || '';
    result.location = result.location || document.querySelector('.posting-categories .location')?.innerText?.trim() || '';
    const workType = document.querySelector('.posting-categories .workplace-type')?.innerText?.trim();
    if (workType) result.workMode = workType;
  }

  // Ashby
  if (host.includes('ashbyhq.com') || document.querySelector('[data-testid="job-posting"]')) {
    result.title = result.title || document.querySelector('h1')?.innerText?.trim() || '';
    result.location = result.location || document.querySelector('h1 + div')?.innerText?.trim() || '';
  }

  // LinkedIn
  if (host.includes('linkedin.com')) {
    result.title = result.title || document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1')?.innerText?.trim() || '';
    result.company = result.company || document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name')?.innerText?.trim() || '';
    result.location = result.location || document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet')?.innerText?.trim() || '';
  }

  // 3. Generic title fallback
  if (!result.title) {
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText.trim().length > 3 && h1.innerText.trim().length < 100) {
      result.title = h1.innerText.trim();
    } else {
      result.title = document.title.split(/[-–|]/)[0].trim();
    }
  }

  // Generic company fallback
  if (!result.company) {
    const ogSite = document.querySelector('meta[property="og:site_name"]')?.content;
    if (ogSite) result.company = ogSite;
    else {
      const parts = document.title.split(/[-–|]/);
      if (parts.length > 1) result.company = parts[parts.length - 1].trim();
    }
  }

  // 4. Extract main job description text
  if (!result.description) {
    const containers = [
      document.querySelector('#content'),
      document.querySelector('[data-ui="job-description"]'),
      document.querySelector('.job-description'),
      document.querySelector('#job-description'),
      document.querySelector('.jobs-description__content'),
      document.querySelector('article'),
      document.querySelector('main'),
      document.body
    ];

    for (const c of containers) {
      if (c && c.innerText.trim().length > 200) {
        result.description = c.innerText.trim().slice(0, 10000);
        break;
      }
    }
  }

  // 5. Work Mode & Employment Type heuristics
  const textBlob = (result.title + ' ' + result.location + ' ' + result.description).toLowerCase();
  if (/remote|work from home|telecommute|wfh/i.test(textBlob)) {
    result.workMode = 'Remote';
  } else if (/hybrid/i.test(textBlob)) {
    result.workMode = 'Hybrid';
  } else if (/on-site|onsite|in-office/i.test(textBlob)) {
    result.workMode = 'On-site';
  }

  if (/intern|internship/i.test(textBlob)) {
    result.employmentType = 'Internship';
  } else if (/contract|temporary|freelance/i.test(textBlob)) {
    result.employmentType = 'Contract';
  } else if (/part-time|part time/i.test(textBlob)) {
    result.employmentType = 'Part-time';
  }

  // 6. Section parsing: Responsibilities, Requirements, Tech
  const lines = result.description.split(/\\r?\\n/).map(l => l.trim()).filter(Boolean);
  let currentSection = null;

  for (const line of lines) {
    if (/^(what you'll do|responsibilities|the role|your role|duties|what you will do)/i.test(line)) {
      currentSection = 'resp';
      continue;
    } else if (/^(what you bring|requirements|qualifications|who you are|what we look for|must have|basic qualifications)/i.test(line)) {
      currentSection = 'req';
      continue;
    } else if (/^(nice to have|preferred qualifications|bonus points)/i.test(line)) {
      currentSection = 'nice';
      continue;
    }

    if (currentSection === 'resp' && (line.startsWith('•') || line.startsWith('-') || line.length < 200)) {
      if (result.responsibilities.length < 15) result.responsibilities.push(line.replace(/^[•\-*]\\s*/, ''));
    } else if ((currentSection === 'req' || currentSection === 'nice') && (line.startsWith('•') || line.startsWith('-') || line.length < 200)) {
      if (result.requirements.length < 20) result.requirements.push(line.replace(/^[•\-*]\\s*/, ''));
    }
  }

  // 7. Tech keywords scanning
  const commonTech = [
    'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Next.js', 'Go', 'Golang',
    'Java', 'C++', 'Rust', 'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'SQL', 'PostgreSQL',
    'MongoDB', 'Redis', 'GraphQL', 'REST', 'Git', 'Linux', 'PyTorch', 'TensorFlow', 'LLM',
    'LangChain', 'FastAPI', 'Django', 'Flask', 'HTML', 'CSS', 'Tailwind', 'CI/CD'
  ];

  const foundTech = new Set();
  for (const tech of commonTech) {
    const escaped = tech.replace(/[.*+?^$\\{}()|[\\]\\\\]/g, '\\\\$&');
    const rx = new RegExp('\\\\b' + escaped + '\\\\b', 'i');
    if (rx.test(result.description) || rx.test(result.title)) {
      foundTech.add(tech);
    }
  }
  result.technologies = Array.from(foundTech);

  return result;
})()`;

/**
 * Execute job page analysis on the specified tab.
 * @param {number} tabId
 * @returns {Promise<object>}
 */
export async function analyzeJobPage(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Direct execution inside target tab context
        const code = EXTRACT_JOB_SCRIPT;
        return eval(code);
      },
    });

    const jobData = results?.[0]?.result || {}
    console.log(`[JobAnalyzer] Extracted job: "${jobData.title}" at "${jobData.company}"`)
    return jobData
  } catch (err) {
    console.warn(`[JobAnalyzer] Scripting failed, falling back to basic page info:`, err)
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    return {
      title: tab?.title || 'Unknown Position',
      company: '',
      location: '',
      workMode: 'Unknown',
      employmentType: 'Full-time',
      description: tab?.title || '',
      responsibilities: [],
      requirements: [],
      technologies: [],
      url: tab?.url || '',
    }
  }
}
