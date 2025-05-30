// Background service worker for LinkedIn Job Manager
chrome.runtime.onInstalled.addListener(function() {
  console.log('LinkedIn Job Manager extension installed');
  
  // Set default settings
  chrome.storage.sync.set({
    linkedinHiderEnabled: true,
    linkedinDismissingEnabled: false,
    linkedinCompanyBlockingEnabled: false
  });
});
