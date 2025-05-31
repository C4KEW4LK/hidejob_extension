// LinkedIn Job Manager - Content Script
(function() {
  let hidingIntervalId = null;
  let dismissingIntervalId = null;
  let companyBlockingIntervalId = null;
  let timeoutId = null;
  let isHidingEnabled = true;
  let isDismissingEnabled = false;
  let isCompanyBlockingEnabled = false;
  let dismissKeywords = [];
  let blockedCompanies = [];

  // Track processed job IDs to avoid reprocessing
  let processedJobIds = new Set();
  let hiddenJobIds = new Set();
  let dismissedJobIds = new Set();
  let companyHiddenJobIds = new Set();

  // Stats tracking
  let totalDismissed = 0;
  let totalHidden = 0;
  let totalCompanyHidden = 0;

  // Hide dismissed job cards function
  function hideDismissedJobs() {
    if (!isHidingEnabled) return 0;
    
    let hiddenCount = 0;
    
    document.querySelectorAll('.job-card-job-posting-card-wrapper[data-job-id]:not([data-hidden])').forEach(function(wrapper) {
      const jobId = wrapper.getAttribute('data-job-id');
      if (!jobId) return;
      
      const dismissedWrapper = wrapper.querySelector('.job-card-job-posting-card-wrapper--dismissed');
      const dismissedClass = wrapper.classList.contains('job-card-job-posting-card-wrapper--dismissed');
      const parentDismissed = wrapper.closest('.job-card-job-posting-card-wrapper--dismissed');
      const anyDismissedElement = wrapper.querySelector('[class*="dismissed"]');
      const isStoredJobId = hiddenJobIds.has(jobId) || dismissedJobIds.has(jobId);
      
      if (dismissedWrapper || dismissedClass || parentDismissed || anyDismissedElement || isStoredJobId) {
        const li = wrapper.closest('li.ember-view.occludable-update') || wrapper.closest('li') || wrapper.closest('[data-job-id]')?.parentElement;
        
        if (li) {
          li.style.display = 'none';
          li.setAttribute('data-hidden', 'true');
          wrapper.setAttribute('data-hidden', 'true');
          
          if (!hiddenJobIds.has(jobId)) {
            hiddenJobIds.add(jobId);
            storeJobId(jobId, 'hidden');
          }
          
          hiddenCount++;
          totalHidden++;
          
          console.log(`LinkedIn Job Manager: ✓ Hidden job ID ${jobId}`);
        }
      }
    });
    
    return hiddenCount;
  }

  // Dismiss jobs with keywords function
  async function dismissJobsWithKeywords() {
    if (!isDismissingEnabled || dismissKeywords.length === 0) return 0;
    
    // Only log keywords if they've changed
    const keywordsString = dismissKeywords.join(',');
    if (!dismissJobsWithKeywords.lastKeywords || dismissJobsWithKeywords.lastKeywords !== keywordsString) {
      console.log('LinkedIn Job Manager: Updated keywords:', dismissKeywords);
      dismissJobsWithKeywords.lastKeywords = keywordsString;
    }
    
    const buttons = document.querySelectorAll('button[aria-label*="Dismiss"][aria-label*="job"]');
    if (buttons.length === 0) return 0;
    
    let dismissedCount = 0;
    
    for (const button of buttons) {
      const ariaLabel = button.getAttribute('aria-label');
      if (!ariaLabel) continue;
      
      // Find the job wrapper - try multiple approaches to get the job ID
      let jobWrapper = button.closest('.job-card-job-posting-card-wrapper[data-job-id]');
      let jobId = null;
      
      if (jobWrapper) {
        jobId = jobWrapper.getAttribute('data-job-id');
      }
      
      // If we can't find it with the wrapper, try looking up the DOM tree
      if (!jobId) {
        let currentElement = button;
        while (currentElement && currentElement !== document.body) {
          if (currentElement.hasAttribute('data-job-id')) {
            jobId = currentElement.getAttribute('data-job-id');
            jobWrapper = currentElement;
            break;
          }
          currentElement = currentElement.parentElement;
        }
      }
      
      // If still no job ID, try looking in nearby elements
      if (!jobId) {
        const nearbyElements = [
          button.closest('li'),
          button.closest('div[data-job-id]'),
          button.closest('.job-card-container'),
          button.closest('.job-card-list')
        ].filter(Boolean);
        
        for (const element of nearbyElements) {
          const foundJobId = element.querySelector('[data-job-id]');
          if (foundJobId) {
            jobId = foundJobId.getAttribute('data-job-id');
            jobWrapper = foundJobId;
            break;
          }
        }
      }
      
      // Skip if we've already processed this job ID
      if (jobId && dismissedJobIds.has(jobId)) continue;
      
      // Extract job info from the aria-label (this was working before)
      const jobNameLower = ariaLabel.toLowerCase();
      const matchedKeyword = dismissKeywords.find(kw => 
        jobNameLower.includes(kw.toLowerCase())
      );
      
      if (matchedKeyword) {
        try {
          if (document.body.contains(button)) {
            button.click();
            
            if (jobId) {
              dismissedJobIds.add(jobId);
              storeJobId(jobId, 'dismissed');
              console.log(`LinkedIn Job Manager: ✓ Dismissed job ID ${jobId}: ${ariaLabel} (matched: "${matchedKeyword}")`);
            } else {
              console.log(`LinkedIn Job Manager: ✓ Dismissed job (no ID found): ${ariaLabel} (matched: "${matchedKeyword}")`);
            }
            
            dismissedCount++;
            totalDismissed++;
            
            // Wait between clicks
            await new Promise(r => setTimeout(r, 200));
          }
        } catch (err) {
          console.warn('LinkedIn Job Manager: Failed to dismiss job:', ariaLabel, err);
        }
      }
    }
    
    if (dismissedCount > 0) {
      console.log(`LinkedIn Job Manager: Dismissed ${dismissedCount} jobs in this cycle`);
    }
    return dismissedCount;
  }

// Hide jobs from blocked companies function - COMPLETE FIXED VERSION
function hideJobsFromBlockedCompanies() {
  if (!isCompanyBlockingEnabled || blockedCompanies.length === 0) return 0;
  
  let hiddenCount = 0;
  
  document.querySelectorAll('.job-card-job-posting-card-wrapper[data-job-id]:not([data-company-hidden])').forEach(function(wrapper) {
    const jobId = wrapper.getAttribute('data-job-id');
    if (!jobId || companyHiddenJobIds.has(jobId)) return;
    
    let companyFound = null;
    let detectedCompany = '';
    
    // Method 1: Look for the specific LinkedIn company name structure
    const companySubtitle = wrapper.querySelector('.artdeco-entity-lockup__subtitle div[dir="ltr"]');
    if (companySubtitle) {
      detectedCompany = companySubtitle.textContent.trim();
    }
    
    // Method 2: Fallback - look for other common company selectors
    if (!detectedCompany) {
      const companySelectors = [
        '.job-card-container__company-name',
        '.job-card-list__company-name', 
        '[data-control-name="company_name"]',
        '.artdeco-entity-lockup__subtitle',
        '.job-card-container__primary-description'
      ];
      
      for (const selector of companySelectors) {
        const element = wrapper.querySelector(selector);
        if (element) {
          const companyText = element.textContent.trim();
          if (companyText && companyText.length > 0 && companyText.length < 100) {
            detectedCompany = companyText;
            break;
          }
        }
      }
    }
    
    // Method 3: Last resort - look through all text elements for company patterns
    if (!detectedCompany) {
      const allTextElements = wrapper.querySelectorAll('div[dir="ltr"], span, a');
      for (const element of allTextElements) {
        const text = element.textContent.trim();
        // Skip if text is too long (likely job description) or too short
        if (text.length > 2 && text.length < 50 && !text.includes('•') && !text.includes('$')) {
          // Check if this might be a company name by seeing if it matches our blocked list
          const matchedCompany = blockedCompanies.find(company => 
            text.toLowerCase().includes(company.toLowerCase())
          );
          if (matchedCompany) {
            detectedCompany = text;
            break;
          }
        }
      }
    }
    
    // Check if detected company matches any blocked companies
    if (detectedCompany) {
      const matchedCompany = blockedCompanies.find(company => {
        const companyLower = detectedCompany.toLowerCase();
        const blockedLower = company.toLowerCase();
        return companyLower.includes(blockedLower) || blockedLower.includes(companyLower);
      });
      
      if (matchedCompany) {
        companyFound = matchedCompany;
      }
    }
    
    // Hide the job if company is blocked
    if (companyFound) {
      const li = wrapper.closest('li.ember-view.occludable-update') || wrapper.closest('li') || wrapper.closest('[data-job-id]')?.parentElement;
      
      if (li) {
        li.style.display = 'none';
        li.setAttribute('data-company-hidden', 'true');
        wrapper.setAttribute('data-company-hidden', 'true');
        
        companyHiddenJobIds.add(jobId);
        hiddenCount++;
        totalCompanyHidden++;
        
        console.log(`LinkedIn Job Manager: ✓ Hidden job ID ${jobId} from blocked company "${companyFound}" (detected as: "${detectedCompany}")`);
        storeJobId(jobId, 'company-hidden');
      }
    }
  });
  
  return hiddenCount;
}

// Debug function to help identify company name selectors
function debugCompanyDetection() {
  console.log('=== COMPANY DETECTION DEBUG ===');
  
  const jobCards = document.querySelectorAll('.job-card-job-posting-card-wrapper[data-job-id]');
  console.log(`Found ${jobCards.length} job cards`);
  
  jobCards.forEach((card, index) => {
    if (index < 3) { // Debug first 3 jobs
      const jobId = card.getAttribute('data-job-id');
      console.log(`\n--- Job ${index + 1} (ID: ${jobId}) ---`);
      
      // Check the specific selector you mentioned
      const subtitleDiv = card.querySelector('.artdeco-entity-lockup__subtitle div[dir="ltr"]');
      if (subtitleDiv) {
        console.log('✓ Found via .artdeco-entity-lockup__subtitle div[dir="ltr"]:', subtitleDiv.textContent.trim());
      } else {
        console.log('✗ NOT found via .artdeco-entity-lockup__subtitle div[dir="ltr"]');
      }
      
      // Check other potential selectors
      const selectors = [
        '.artdeco-entity-lockup__subtitle',
        '.job-card-container__company-name',
        '.job-card-list__company-name',
        '[data-control-name="company_name"]'
      ];
      
      selectors.forEach(selector => {
        const element = card.querySelector(selector);
        if (element) {
          console.log(`✓ Found via ${selector}:`, element.textContent.trim());
        }
      });
      
      // Show all div[dir="ltr"] elements
      const allDirElements = card.querySelectorAll('div[dir="ltr"]');
      console.log(`Found ${allDirElements.length} div[dir="ltr"] elements:`);
      allDirElements.forEach((el, i) => {
        console.log(`  ${i + 1}: "${el.textContent.trim()}"`);
      });
    }
  });
}

  // Control functions
  function startHiding() {
    if (hidingIntervalId) return;
    console.log('LinkedIn Job Manager: Starting job card hiding');
    hideDismissedJobs();
    hidingIntervalId = setInterval(hideDismissedJobs, 200);
  }

  function stopHiding() {
    if (hidingIntervalId) {
      clearInterval(hidingIntervalId);
      hidingIntervalId = null;
      console.log('LinkedIn Job Manager: Stopped job card hiding');
    }
  }

  async function startDismissing() {
    if (dismissingIntervalId) return;
    console.log('LinkedIn Job Manager: Starting keyword-based job dismissing');
    console.log('Keywords:', dismissKeywords);
    
    await dismissJobsWithKeywords();
    dismissingIntervalId = setInterval(async () => {
      await dismissJobsWithKeywords();
    }, 200);
    
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(function() {
      stopDismissing();
      console.log('LinkedIn Job Manager: Stopped auto-dismissing after 10 minutes');
    }, 600000);
  }

  function stopDismissing() {
    if (dismissingIntervalId) {
      clearInterval(dismissingIntervalId);
      dismissingIntervalId = null;
      console.log('LinkedIn Job Manager: Stopped keyword-based job dismissing');
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function startCompanyBlocking() {
    if (companyBlockingIntervalId) return;
    console.log('LinkedIn Job Manager: Starting company-based job blocking');
    console.log('Blocked companies:', blockedCompanies);
    hideJobsFromBlockedCompanies();
    companyBlockingIntervalId = setInterval(hideJobsFromBlockedCompanies, 200);
  }

  function stopCompanyBlocking() {
    if (companyBlockingIntervalId) {
      clearInterval(companyBlockingIntervalId);
      companyBlockingIntervalId = null;
      console.log('LinkedIn Job Manager: Stopped company-based job blocking');
    }
  }

  function showHiddenJobs() {
    let restoredCount = 0;
    
    console.log('LinkedIn Job Manager: Attempting to restore hidden jobs');
    console.log('Hidden job IDs:', Array.from(hiddenJobIds));
    console.log('Company hidden job IDs:', Array.from(companyHiddenJobIds));
    
    // First, try to restore by finding all elements with data-hidden attribute
    document.querySelectorAll('[data-hidden="true"]').forEach(element => {
      console.log('Found hidden element:', element);
      element.style.display = '';
      element.removeAttribute('data-hidden');
      restoredCount++;
    });
    
    // Also restore company-hidden elements
    document.querySelectorAll('[data-company-hidden="true"]').forEach(element => {
      console.log('Found company-hidden element:', element);
      element.style.display = '';
      element.removeAttribute('data-company-hidden');
      restoredCount++;
    });
    
    // Try to restore by job ID as backup
    hiddenJobIds.forEach(jobId => {
      const wrapper = document.querySelector(`.job-card-job-posting-card-wrapper[data-job-id="${jobId}"]`);
      if (wrapper) {
        const li = wrapper.closest('li') || wrapper.closest('[data-job-id]')?.parentElement;
        if (li && li.style.display === 'none') {
          console.log(`Restoring hidden job ID: ${jobId}`);
          li.style.display = '';
          li.removeAttribute('data-hidden');
          wrapper.removeAttribute('data-hidden');
          restoredCount++;
        }
      }
    });
    
    companyHiddenJobIds.forEach(jobId => {
      const wrapper = document.querySelector(`.job-card-job-posting-card-wrapper[data-job-id="${jobId}"]`);
      if (wrapper) {
        const li = wrapper.closest('li') || wrapper.closest('[data-job-id]')?.parentElement;
        if (li && li.style.display === 'none') {
          console.log(`Restoring company-hidden job ID: ${jobId}`);
          li.style.display = '';
          li.removeAttribute('data-company-hidden');
          wrapper.removeAttribute('data-company-hidden');
          restoredCount++;
        }
      }
    });
    
    // Clear the Sets and reset counters
    hiddenJobIds.clear();
    companyHiddenJobIds.clear();
    totalHidden = 0;
    totalCompanyHidden = 0;
    
    // Clear from storage
    chrome.storage.local.set({
      hiddenJobIds: [],
      companyHiddenJobIds: []
    }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error clearing storage:', chrome.runtime.lastError);
      } else {
        console.log('LinkedIn Job Manager: Storage cleared');
      }
    });
    
    console.log(`LinkedIn Job Manager: Restored ${restoredCount} hidden job(s)`);
    return restoredCount;
  }

  // Store job IDs in chrome storage
  function storeJobId(jobId, action) {
    const storageKey = action === 'dismissed' ? 'dismissedJobIds' : 
                      action === 'company-hidden' ? 'companyHiddenJobIds' : 'hiddenJobIds';
    
    chrome.storage.local.get([storageKey], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        return;
      }
      
      const jobIds = result[storageKey] || [];
      if (!jobIds.includes(jobId)) {
        jobIds.push(jobId);
        const trimmedJobIds = jobIds.slice(-1000);
        
        chrome.storage.local.set({ [storageKey]: trimmedJobIds }, function() {
          if (chrome.runtime.lastError) {
            console.error('Storage save error:', chrome.runtime.lastError);
          }
        });
      }
    });
  }

  // Load stored job IDs
  function loadStoredJobIds() {
    chrome.storage.local.get(['dismissedJobIds', 'hiddenJobIds', 'companyHiddenJobIds'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading stored job IDs:', chrome.runtime.lastError);
        return;
      }
      
      if (result.dismissedJobIds) {
        result.dismissedJobIds.forEach(id => dismissedJobIds.add(id));
        console.log(`LinkedIn Job Manager: Loaded ${result.dismissedJobIds.length} dismissed job IDs`);
      }
      if (result.hiddenJobIds) {
        result.hiddenJobIds.forEach(id => hiddenJobIds.add(id));
        console.log(`LinkedIn Job Manager: Loaded ${result.hiddenJobIds.length} hidden job IDs`);
      }
      if (result.companyHiddenJobIds) {
        result.companyHiddenJobIds.forEach(id => companyHiddenJobIds.add(id));
        console.log(`LinkedIn Job Manager: Loaded ${result.companyHiddenJobIds.length} company hidden job IDs`);
      }
    });
  }

  // Initialize extension
  function initializeExtension() {
    chrome.storage.sync.get(['linkedinHiderEnabled', 'linkedinDismissingEnabled', 'linkedinCompanyBlockingEnabled', 'dismissKeywords', 'blockedCompanies'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading settings:', chrome.runtime.lastError);
        return;
      }
      
      isHidingEnabled = result.linkedinHiderEnabled !== false;
      isDismissingEnabled = result.linkedinDismissingEnabled === true;
      isCompanyBlockingEnabled = result.linkedinCompanyBlockingEnabled === true;
      dismissKeywords = result.dismissKeywords || [];
      blockedCompanies = result.blockedCompanies || [];
      
      loadStoredJobIds();
      
      if (isHidingEnabled) startHiding();
      if (isDismissingEnabled) startDismissing();
      if (isCompanyBlockingEnabled) startCompanyBlocking();
      
      console.log('LinkedIn Job Manager: Initialized', {
        hiding: isHidingEnabled,
        dismissing: isDismissingEnabled,
        companyBlocking: isCompanyBlockingEnabled,
        keywordCount: dismissKeywords.length,
        companyCount: blockedCompanies.length
      });
    });
  }

// Message listener
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    switch(request.action) {
      case 'ping':
        sendResponse({ status: 'ready' });
        break;
        
      case 'toggleHiding':
        isHidingEnabled = request.enabled;
        if (isHidingEnabled) {
          startHiding();
        } else {
          stopHiding();
        }
        sendResponse({message: isHidingEnabled ? 'Job hiding started' : 'Job hiding stopped'});
        break;
        
      case 'toggleDismissing':
        isDismissingEnabled = request.enabled;
        if (isDismissingEnabled) {
          startDismissing();
        } else {
          stopDismissing();
        }
        sendResponse({message: isDismissingEnabled ? 'Auto-dismissing started' : 'Auto-dismissing stopped'});
        break;
        
      case 'toggleCompanyBlocking':
        isCompanyBlockingEnabled = request.enabled;
        if (isCompanyBlockingEnabled) {
          startCompanyBlocking();
        } else {
          stopCompanyBlocking();
        }
        sendResponse({message: isCompanyBlockingEnabled ? 'Company blocking started' : 'Company blocking stopped'});
        break;
        
      case 'updateKeywords':
        dismissKeywords = request.keywords || [];
        console.log('LinkedIn Job Manager: Updated keywords', dismissKeywords);
        if (isDismissingEnabled) {
          stopDismissing();
          startDismissing();
        }
        sendResponse({message: `Updated to ${dismissKeywords.length} keywords`});
        break;
        
      case 'updateCompanies':
        blockedCompanies = request.companies || [];
        console.log('LinkedIn Job Manager: Updated blocked companies', blockedCompanies);
        if (isCompanyBlockingEnabled) {
          stopCompanyBlocking();
          startCompanyBlocking();
        }
        sendResponse({message: `Updated to ${blockedCompanies.length} companies`});
        break;
        
      case 'runAllFeatures':
        let totalActions = 0;
        let results = [];
        
        console.log('LinkedIn Job Manager: Running all enabled features...');
        console.log('Features enabled:', {
          hiding: isHidingEnabled,
          dismissing: isDismissingEnabled,
          companyBlocking: isCompanyBlockingEnabled
        });
        
        // Run hiding feature if enabled
        if (isHidingEnabled) {
          const hiddenCount = hideDismissedJobs();
          totalActions += hiddenCount;
          if (hiddenCount > 0) {
            results.push(`${hiddenCount} dismissed jobs hidden`);
          }
          console.log(`LinkedIn Job Manager: Hidden ${hiddenCount} dismissed jobs`);
        }
        
        // Run company blocking feature if enabled
        if (isCompanyBlockingEnabled) {
          const companyHiddenCount = hideJobsFromBlockedCompanies();
          totalActions += companyHiddenCount;
          if (companyHiddenCount > 0) {
            results.push(`${companyHiddenCount} company jobs hidden`);
          }
          console.log(`LinkedIn Job Manager: Hidden ${companyHiddenCount} company jobs`);
        }
        
        // Run dismissing feature if enabled (this is async, so handle separately)
        if (isDismissingEnabled) {
          dismissJobsWithKeywords().then(dismissedCount => {
            totalActions += dismissedCount;
            if (dismissedCount > 0) {
              results.push(`${dismissedCount} keyword jobs dismissed`);
            }
            console.log(`LinkedIn Job Manager: Dismissed ${dismissedCount} keyword jobs`);
            
            const finalMessage = results.length > 0 ? results.join(', ') : 'No actions needed - all jobs already processed';
            console.log('LinkedIn Job Manager: Final result:', finalMessage);
            sendResponse({ message: finalMessage });
          }).catch(error => {
            console.error('LinkedIn Job Manager: Error in dismissJobsWithKeywords:', error);
            const finalMessage = results.length > 0 ? results.join(', ') + ' (dismissing had errors)' : 'Error in dismissing feature';
            sendResponse({ message: finalMessage });
          });
          return true; // Indicate async response
        } else {
          // No async operations, send response immediately
          const finalMessage = results.length > 0 ? results.join(', ') : 'No actions needed - all jobs already processed';
          console.log('LinkedIn Job Manager: Final result:', finalMessage);
          sendResponse({ message: finalMessage });
        }
        break;
        
      case 'hideJobsNow':
        const hiddenCount = hideDismissedJobs();
        sendResponse({message: `Hidden ${hiddenCount} dismissed job card(s)`});
        break;
        
      case 'dismissJobsNow':
        dismissJobsWithKeywords().then(dismissedCount => {
          sendResponse({message: `Dismissed ${dismissedCount} keyword job(s)`});
        });
        return true;
        
      case 'debugJobs':
        // Debug function to see what jobs are found
        const jobCards = document.querySelectorAll('.job-card-job-posting-card-wrapper[data-job-id]');
        console.log(`=== DEBUG: Found ${jobCards.length} job cards ===`);
        
        jobCards.forEach((card, index) => {
          if (index < 5) { // Only debug first 5 jobs
            const jobId = card.getAttribute('data-job-id');
            const titleEl = card.querySelector('h3 a, .job-card-list__title a, [data-control-name="job_card_title_link"]');
            const companyEl = card.querySelector('.job-card-container__company-name, .job-card-list__company-name, [data-control-name="company_name"]');
            const dismissBtn = card.querySelector('button[aria-label*="Dismiss"], button[data-control-name*="dismiss"]');
            
            console.log(`Job ${index + 1}:`, {
              jobId: jobId,
              title: titleEl ? titleEl.textContent.trim() : 'NO TITLE FOUND',
              company: companyEl ? companyEl.textContent.trim() : 'NO COMPANY FOUND',
              hasDismissButton: !!dismissBtn,
              dismissButtonInfo: dismissBtn ? {
                ariaLabel: dismissBtn.getAttribute('aria-label'),
                className: dismissBtn.className,
                textContent: dismissBtn.textContent
              } : 'NO DISMISS BUTTON'
            });
          }
        });
        
        sendResponse({message: `Debugged ${Math.min(5, jobCards.length)} jobs - check console`});
        break;
        
      case 'hideCompaniesNow':
        const companyHiddenCount = hideJobsFromBlockedCompanies();
        sendResponse({message: `Hidden ${companyHiddenCount} company job(s)`});
        break;
        
      case 'showHiddenJobs':
        const restoredCount = showHiddenJobs();
        sendResponse({message: `Restored ${restoredCount} hidden job card(s)`});
        break;
        
      // Test cases for debugging
      case 'testHiding':
        const testHiddenCount = hideDismissedJobs();
        sendResponse({ message: `Hidden ${testHiddenCount} jobs` });
        break;

      case 'testCompanyBlocking':
        const testCompanyCount = hideJobsFromBlockedCompanies();
        sendResponse({ message: `Hidden ${testCompanyCount} company jobs` });
        break;
        
      case 'debugCompanies':
        // Debug function for company detection
        console.log('=== COMPANY DETECTION DEBUG ===');
        
        const allJobCards = document.querySelectorAll('.job-card-job-posting-card-wrapper[data-job-id]');
        console.log(`Found ${allJobCards.length} job cards`);
        
        allJobCards.forEach((card, index) => {
          if (index < 3) { // Debug first 3 jobs
            const jobId = card.getAttribute('data-job-id');
            console.log(`\n--- Job ${index + 1} (ID: ${jobId}) ---`);
            
            // Check the specific selector you mentioned
            const subtitleDiv = card.querySelector('.artdeco-entity-lockup__subtitle div[dir="ltr"]');
            if (subtitleDiv) {
              console.log('✓ Found via .artdeco-entity-lockup__subtitle div[dir="ltr"]:', subtitleDiv.textContent.trim());
            } else {
              console.log('✗ NOT found via .artdeco-entity-lockup__subtitle div[dir="ltr"]');
            }
            
            // Check other potential selectors
            const selectors = [
              '.artdeco-entity-lockup__subtitle',
              '.job-card-container__company-name',
              '.job-card-list__company-name',
              '[data-control-name="company_name"]'
            ];
            
            selectors.forEach(selector => {
              const element = card.querySelector(selector);
              if (element) {
                console.log(`✓ Found via ${selector}:`, element.textContent.trim());
              }
            });
            
            // Show all div[dir="ltr"] elements
            const allDirElements = card.querySelectorAll('div[dir="ltr"]');
            console.log(`Found ${allDirElements.length} div[dir="ltr"] elements:`);
            allDirElements.forEach((el, i) => {
              console.log(`  ${i + 1}: "${el.textContent.trim()}"`);
            });
          }
        });
        
        sendResponse({message: 'Company detection debug info logged to console'});
        break;
    }
    return true;
  });

  // Handle page navigation within LinkedIn
  let currentUrl = window.location.href;
  const observer = new MutationObserver(function() {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      setTimeout(() => {
        if (isHidingEnabled) startHiding();
        if (isDismissingEnabled) startDismissing();
        if (isCompanyBlockingEnabled) startCompanyBlocking();
      }, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Clean up on page unload
  window.addEventListener('beforeunload', function() {
    stopHiding();
    stopDismissing();
    stopCompanyBlocking();
    observer.disconnect();
  });

  // Initialize when script loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
  } else {
    initializeExtension();
  }

  console.log('LinkedIn Job Manager: Content script loaded and ready');
})();
