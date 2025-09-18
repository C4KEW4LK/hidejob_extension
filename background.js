// background.js - Service Worker for LinkedIn Job Manager
'use strict';

// Extension lifecycle management
chrome.runtime.onInstalled.addListener((details) => {
  console.log('LinkedIn Job Manager installed/updated:', details.reason);

  if (details.reason === 'install') {
    // Check if settings already exist to avoid overwriting them on new device sync
    chrome.storage.sync.get([
      'linkedinHiderEnabled',
      'dismissKeywords',
      'blockedCompanies'
    ], (existingSettings) => {
      const defaultSettings = {
        linkedinHiderEnabled: true,
        linkedinAutoDismissFromListEnabled: false,
        linkedinDismissingEnabled: false,
        linkedinCompanyBlockingEnabled: false,
        dismissKeywords: [],
        blockedCompanies: []
        // Note: dismissedJobIds are managed separately and chunked, so we don't set a default here.
      };

      const settingsToSet = {};
      let isNewInstall = true;

      // Check if any core setting is already defined.
      if (existingSettings.linkedinHiderEnabled !== undefined || existingSettings.dismissKeywords !== undefined) {
        isNewInstall = false;
        console.log('Existing settings found in sync storage. Skipping default setup.');
      }

      if (isNewInstall) {
        console.log('No existing settings found. Initializing defaults.');
        chrome.storage.sync.set(defaultSettings);
        chrome.storage.local.set({ dismissedJobIds: [] });
        console.log('Default settings initialized');
      }
    });
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('LinkedIn Job Manager service worker started');
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from:', sender);
  
  // Handle different message types
  switch (message.action) {
    case 'getExtensionInfo':
      sendResponse({
        version: chrome.runtime.getManifest().version,
        name: chrome.runtime.getManifest().name
      });
      break;
      
    case 'ping':
      sendResponse({ status: 'background-active' });
      break;
      
    default:
      // For most messages, just acknowledge receipt
      sendResponse({ received: true });
  }
  
  return true; // Keep message channel open for async responses
});

// Handle tab updates to ensure content scripts are loaded on LinkedIn
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act when page is fully loaded
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('linkedin.com')) {
    console.log('LinkedIn tab loaded:', tab.url);
    
    // Optionally inject content scripts if they're not already loaded
    // This is a fallback in case the manifest content_scripts don't load properly
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Check if our extension is already loaded
        return typeof window.LinkedInJobManager !== 'undefined';
      }
    }).then((results) => {
      if (results && results[0] && !results[0].result) {
        console.log('Extension not detected, content scripts may need manual injection');
      }
    }).catch((error) => {
      console.log('Could not check extension status:', error);
    });
  }
});

// Handle extension icon clicks (optional - popup already handles this)
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked on tab:', tab.url);
  
  if (!tab.url || !tab.url.includes('linkedin.com')) {
    // Show notification if not on LinkedIn
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png', // Add this icon if you have one
      title: 'LinkedIn Job Manager',
      message: 'Please navigate to LinkedIn to use this extension.'
    });
  }
});



// Handle extension suspension/resumption
self.addEventListener('suspend', () => {
  console.log('Service worker suspending');
});

// Error handling
self.addEventListener('error', (error) => {
  console.error('Service worker error:', error);
});

// Keep service worker alive during active use
let keepAliveInterval;

function keepAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // This simple call keeps the service worker active
    });
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Start keep-alive when extension is actively used
chrome.runtime.onConnect.addListener(() => {
  keepAlive();
});

chrome.runtime.onMessage.addListener(() => {
  keepAlive();
});

// Stop keep-alive after period of inactivity
setTimeout(stopKeepAlive, 300000); // Stop after 5 minutes of inactivity

console.log('LinkedIn Job Manager background script loaded');