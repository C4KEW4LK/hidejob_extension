// LinkedIn Job Manager - Content Script
(function() {
  let hidingIntervalId = null;
  let dismissingIntervalId = null;
  let timeoutId = null;
  let isHidingEnabled = true;
  let isDismissingEnabled = false;
  let dismissKeywords = [];

  // Stats tracking
  let totalDismissed = 0;
  let totalHidden = 0;

  // Hide dismissed job cards function
  function hideDismissedJobs() {
    if (!isHidingEnabled) return 0;
    
    let hiddenCount = 0;
    document.querySelectorAll('li.ember-view.occludable-update:not([data-hidden])').forEach(function(li) {
      const dismissedWrapper = li.querySelector('.job-card-job-posting-card-wrapper--dismissed');
      
      if (dismissedWrapper) {
        li.style.display = 'none';
        li.setAttribute('data-hidden', 'true');
        hiddenCount++;
        totalHidden++;
        console.log('LinkedIn Job Manager: Hidden dismissed job card:', li.id || 'unnamed');
      }
    });
    
    return hiddenCount;
  }

  // Dismiss jobs with keywords function
  async function dismissJobsWithKeywords() {
    if (!isDismissingEnabled || dismissKeywords.length === 0) return 0;
    
    const buttons = document.querySelectorAll('button[aria-label*="Dismiss"][aria-label*="job"]');
    if (buttons.length === 0) return 0;
    
    let dismissedCount = 0;
    
    for (const button of buttons) {
      const ariaLabel = button.getAttribute('aria-label');
      if (!ariaLabel) continue;
      
      const jobNameLower = ariaLabel.toLowerCase();
      const matchedKeyword = dismissKeywords.find(kw => 
        jobNameLower.includes(kw.toLowerCase())
      );
      
      if (matchedKeyword) {
        try {
          if (document.body.contains(button)) {
            button.click();
            dismissedCount++;
            totalDismissed++;
            console.log(`LinkedIn Job Manager: Dismissed job (${totalDismissed}): ${ariaLabel} (matched: "${matchedKeyword}")`);
            
            // 200ms delay between clicks
            await new Promise(r => setTimeout(r, 200));
          }
        } catch (err) {
          console.warn('LinkedIn Job Manager: Failed to dismiss job:', ariaLabel);
        }
      }
    }
    
    return dismissedCount;
  }

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
    
    // Run once immediately
    await dismissJobsWithKeywords();
    
    // Then run every 3 seconds
    dismissingIntervalId = setInterval(async () => {
      await dismissJobsWithKeywords();
    }, 3000);
    
    // Stop after 10 minutes to prevent running forever
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

  function showHiddenJobs() {
    let restoredCount = 0;
    document.querySelectorAll('li.ember-view.occludable-update[data-hidden]').forEach(function(li) {
      li.style.display = '';
      li.removeAttribute('data-hidden');
      restoredCount++;
    });
    console.log(`LinkedIn Job Manager: Restored ${restoredCount} hidden job card(s)`);
    totalHidden = Math.max(0, totalHidden - restoredCount);
    return restoredCount;
  }

  // Load initial settings and start appropriate functions
  chrome.storage.sync.get(['linkedinHiderEnabled', 'linkedinDismissingEnabled', 'dismissKeywords'], function(result) {
    isHidingEnabled = result.linkedinHiderEnabled !== false;
    isDismissingEnabled = result.linkedinDismissingEnabled === true;
    dismissKeywords = result.dismissKeywords || [];
    
    if (isHidingEnabled) {
      startHiding();
    }
    
    if (isDismissingEnabled) {
      startDismissing();
    }
    
    console.log('LinkedIn Job Manager: Initialized', {
      hiding: isHidingEnabled,
      dismissing: isDismissingEnabled,
      keywordCount: dismissKeywords.length
    });
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    switch(request.action) {
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
        
      case 'updateKeywords':
        dismissKeywords = request.keywords || [];
        console.log('LinkedIn Job Manager: Updated keywords', dismissKeywords);
        // Restart dismissing if it's enabled to use new keywords
        if (isDismissingEnabled) {
          stopDismissing();
          startDismissing();
        }
        sendResponse({message: `Updated to ${dismissKeywords.length} keywords`});
        break;
        
      case 'hideJobsNow':
        const hiddenCount = hideDismissedJobs();
        sendResponse({message: `Hidden ${hiddenCount} dismissed job card(s)`});
        break;
        
      case 'dismissJobsNow':
        dismissJobsWithKeywords().then(dismissedCount => {
          sendResponse({message: `Dismissed ${dismissedCount} keyword job(s)`});
        });
        return true; // Keep message channel open for async response
        
      case 'showHiddenJobs':
        const restoredCount = showHiddenJobs();
        sendResponse({message: `Restored ${restoredCount} hidden job card(s)`});
        break;
    }
    return true;
  });

  // Handle page navigation within LinkedIn (SPA)
  let currentUrl = window.location.href;
  const observer = new MutationObserver(function() {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      // Restart functions after navigation
      setTimeout(() => {
        if (isHidingEnabled) startHiding();
        if (isDismissingEnabled) startDismissing();
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
    observer.disconnect();
  });

  console.log('LinkedIn Job Manager: Content script loaded and ready');
})();