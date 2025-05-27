document.addEventListener('DOMContentLoaded', function() {
  const enableHiding = document.getElementById('enableHiding');
  const enableDismissing = document.getElementById('enableDismissing');
  const keywordsSection = document.getElementById('keywordsSection');
  const keywordsTextarea = document.getElementById('keywords');
  const hideNowButton = document.getElementById('hideNow');
  const dismissNowButton = document.getElementById('dismissNow');
  const showHiddenButton = document.getElementById('showHidden');
  const statusDiv = document.getElementById('status');
  const statusText = document.getElementById('status-text');

  // Default keywords
  const defaultKeywords = [
    "example1", "example2", "example3"
  ];

  // Load saved settings
  chrome.storage.sync.get(['linkedinHiderEnabled', 'linkedinDismissingEnabled', 'dismissKeywords'], function(result) {
    enableHiding.checked = result.linkedinHiderEnabled !== false; // Default to true
    enableDismissing.checked = result.linkedinDismissingEnabled === true; // Default to false
    
    const keywords = result.dismissKeywords || defaultKeywords;
    keywordsTextarea.value = keywords.join('\n');
    
    updateKeywordsVisibility();
    updateStatus();
  });

  // Toggle keywords section visibility
  function updateKeywordsVisibility() {
    keywordsSection.style.display = enableDismissing.checked ? 'block' : 'none';
  }

  function updateStatus() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url.includes('linkedin.com')) {
        const hidingStatus = enableHiding.checked ? 'Hiding' : '';
        const dismissingStatus = enableDismissing.checked ? 'Dismissing' : '';
        
        if (hidingStatus && dismissingStatus) {
          statusText.textContent = 'Hiding & Dismissing Active';
        } else if (hidingStatus) {
          statusText.textContent = 'Hiding Active';
        } else if (dismissingStatus) {
          statusText.textContent = 'Dismissing Active';
        } else {
          statusText.textContent = 'Disabled';
        }
      } else {
        statusText.textContent = 'Not on LinkedIn';
      }
    });
  }

  // Save settings when toggles change
  enableHiding.addEventListener('change', function() {
    const enabled = enableHiding.checked;
    chrome.storage.sync.set({ linkedinHiderEnabled: enabled });
    
    sendMessageToContentScript({
      action: 'toggleHiding',
      enabled: enabled
    });
    
    updateStatus();
    showStatus(enabled ? 'Job hiding enabled' : 'Job hiding disabled', 'success');
  });

  enableDismissing.addEventListener('change', function() {
    const enabled = enableDismissing.checked;
    chrome.storage.sync.set({ linkedinDismissingEnabled: enabled });
    
    updateKeywordsVisibility();
    
    sendMessageToContentScript({
      action: 'toggleDismissing',
      enabled: enabled
    });
    
    updateStatus();
    showStatus(enabled ? 'Auto-dismissing enabled' : 'Auto-dismissing disabled', 'success');
  });

  // Save keywords when textarea loses focus
  keywordsTextarea.addEventListener('blur', function() {
    const keywordsText = keywordsTextarea.value.trim();
    const keywords = keywordsText.split('\n').map(k => k.trim()).filter(k => k.length > 0);
    
    chrome.storage.sync.set({ dismissKeywords: keywords });
    
    sendMessageToContentScript({
      action: 'updateKeywords',
      keywords: keywords
    });
    
    showStatus(`Saved ${keywords.length} keywords`, 'success');
  });

  // Manual actions
  hideNowButton.addEventListener('click', function() {
    sendMessageToContentScript({
      action: 'hideJobsNow'
    }, function(response) {
      showStatus(response ? response.message : 'Jobs hidden!', 'success');
    });
  });

  dismissNowButton.addEventListener('click', function() {
    sendMessageToContentScript({
      action: 'dismissJobsNow'
    }, function(response) {
      showStatus(response ? response.message : 'Keyword jobs dismissed!', 'success');
    });
  });

  showHiddenButton.addEventListener('click', function() {
    sendMessageToContentScript({
      action: 'showHiddenJobs'
    }, function(response) {
      showStatus(response ? response.message : 'Hidden jobs restored!', 'success');
    });
  });

  function sendMessageToContentScript(message, callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        if (!tabs[0].url.includes('linkedin.com')) {
          showStatus('Please navigate to LinkedIn first', 'error');
          return;
        }
        
        chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
          if (chrome.runtime.lastError) {
            showStatus('Error: Make sure you\'re on LinkedIn', 'error');
          } else if (callback) {
            callback(response);
          }
        });
      }
    });
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';
    
    setTimeout(function() {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  // Initial status update
  updateStatus();
});