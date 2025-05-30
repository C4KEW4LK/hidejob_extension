document.addEventListener('DOMContentLoaded', function() {
  const enableHiding = document.getElementById('enableHiding');
  const enableDismissing = document.getElementById('enableDismissing');
  const enableCompanyBlocking = document.getElementById('enableCompanyBlocking');
  const keywordsSection = document.getElementById('keywordsSection');
  const companiesSection = document.getElementById('companiesSection');
  const keywordsTextarea = document.getElementById('keywords');
  const companiesTextarea = document.getElementById('companies');
  const runAllFeaturesButton = document.getElementById('runAllFeatures');
  const showHiddenButton = document.getElementById('showHidden');
  const statusDiv = document.getElementById('status');
  const statusText = document.getElementById('status-text');

  // Load saved settings
  chrome.storage.sync.get(['linkedinHiderEnabled', 'linkedinDismissingEnabled', 'linkedinCompanyBlockingEnabled', 'dismissKeywords', 'blockedCompanies'], function(result) {
    console.log('Loaded settings:', result);
    
    enableHiding.checked = result.linkedinHiderEnabled !== false;
    enableDismissing.checked = result.linkedinDismissingEnabled === true;
    enableCompanyBlocking.checked = result.linkedinCompanyBlockingEnabled === true;
    
    // Load keywords
    let keywords;
    if (result.dismissKeywords && result.dismissKeywords.length > 0) {
      keywords = result.dismissKeywords;
    } else {
      keywords = ['job title 1', 'job title 2', 'job title 3'];
      chrome.storage.sync.set({ dismissKeywords: keywords });
    }
    keywordsTextarea.value = keywords.join('\n');
    
    // Load companies
    let companies;
    if (result.blockedCompanies && result.blockedCompanies.length > 0) {
      companies = result.blockedCompanies;
    } else {
      companies = ['company name 1', 'company name 2', 'company name 3'];
      chrome.storage.sync.set({ blockedCompanies: companies });
    }
    companiesTextarea.value = companies.join('\n');
    
    updateKeywordsVisibility();
    updateCompaniesVisibility();
    updateStatus();
  });

  // Toggle sections visibility
  function updateKeywordsVisibility() {
    keywordsSection.style.display = enableDismissing.checked ? 'block' : 'none';
  }

  function updateCompaniesVisibility() {
    companiesSection.style.display = enableCompanyBlocking.checked ? 'block' : 'none';
  }

  function updateStatus() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url.includes('linkedin.com')) {
        const hidingStatus = enableHiding.checked ? 'Hiding' : '';
        const dismissingStatus = enableDismissing.checked ? 'Dismissing' : '';
        const companyBlockingStatus = enableCompanyBlocking.checked ? 'Company Blocking' : '';
        
        const activeFeatures = [hidingStatus, dismissingStatus, companyBlockingStatus].filter(Boolean);
        
        if (activeFeatures.length > 0) {
          statusText.textContent = activeFeatures.join(' & ') + ' Active';
        } else {
          statusText.textContent = 'Disabled';
        }
      } else {
        statusText.textContent = 'Not on LinkedIn';
      }
    });
  }

  // Event listeners for checkboxes
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

  enableCompanyBlocking.addEventListener('change', function() {
    const enabled = enableCompanyBlocking.checked;
    chrome.storage.sync.set({ linkedinCompanyBlockingEnabled: enabled });
    
    updateCompaniesVisibility();
    
    sendMessageToContentScript({
      action: 'toggleCompanyBlocking',
      enabled: enabled
    });
    
    updateStatus();
    showStatus(enabled ? 'Company blocking enabled' : 'Company blocking disabled', 'success');
  });

  // Save keywords when textarea loses focus
  keywordsTextarea.addEventListener('blur', function() {
    const keywordsText = keywordsTextarea.value.trim();
    const keywords = keywordsText.split('\n')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);
    
    keywordsTextarea.value = keywords.join('\n');
    
    chrome.storage.sync.set({ dismissKeywords: keywords }, function() {
      console.log('Keywords saved:', keywords);
    });
    
    sendMessageToContentScript({
      action: 'updateKeywords',
      keywords: keywords
    });
    
    showStatus(`Saved ${keywords.length} keywords`, 'success');
  });

  // Save companies when textarea loses focus
  companiesTextarea.addEventListener('blur', function() {
    const companiesText = companiesTextarea.value.trim();
    const companies = companiesText.split('\n')
      .map(c => c.trim().toLowerCase())
      .filter(c => c.length > 0);
    
    companiesTextarea.value = companies.join('\n');
    
    chrome.storage.sync.set({ blockedCompanies: companies }, function() {
      console.log('Companies saved:', companies);
    });
    
    sendMessageToContentScript({
      action: 'updateCompanies',
      companies: companies
    });
    
    showStatus(`Saved ${companies.length} companies`, 'success');
  });

  // Button event listeners
  runAllFeaturesButton.addEventListener('click', function() {
    sendMessageToContentScript({
      action: 'runAllFeatures'
    }, function(response) {
      showStatus(response ? response.message : 'All features executed!', 'success');
    });
  });

  showHiddenButton.addEventListener('click', function() {
    sendMessageToContentScript({
      action: 'showHiddenJobs'
    }, function(response) {
      showStatus(response ? response.message : 'Hidden jobs restored!', 'success');
    });
  });

  // Add debug functionality - you can test this by typing in console: 
  // document.getElementById('debugButton').click() if you add this button to HTML
  window.debugJobs = function() {
    sendMessageToContentScript({
      action: 'debugJobs'
    }, function(response) {
      showStatus(response ? response.message : 'Debug info logged to console', 'success');
    });
  };

  function sendMessageToContentScript(message, callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        if (!tabs[0].url.includes('linkedin.com')) {
          showStatus('Please navigate to LinkedIn first', 'error');
          return;
        }
        
        chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
          if (chrome.runtime.lastError) {
            console.error('Extension error:', chrome.runtime.lastError);
            showStatus('Error: Make sure you\'re on LinkedIn and refresh the page', 'error');
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
});
