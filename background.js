// background.js - Service Worker for LinkedIn Job Manager
'use strict';

// Extension lifecycle management
chrome.runtime.onInstalled.addListener((details) => {
  console.log('LinkedIn Job Manager installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      linkedinHiderEnabled: true,
      linkedinAutoDismissFromListEnabled: false,
      linkedinDismissingEnabled: false,
      linkedinCompanyBlockingEnabled: false,
      dismissKeywords: [],
      blockedCompanies: [],
      dismissedJobIds: []
    });
    
    chrome.storage.local.set({
      dismissedJobIds: []
    });
    
    console.log('Default settings initialized');
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

// Clean up storage periodically (optional)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup-storage') {
    console.log('Running periodic storage cleanup for sync');
    
    // Clean up very old dismissed job IDs from sync storage to prevent bloat
    chrome.storage.sync.get(['dismissedJobIds'], (result) => {
      if (result.dismissedJobIds && result.dismissedJobIds.length > 5500) { // A little buffer over 5000
        // Keep only the most recent 5000 job IDs
        const recentJobIds = result.dismissedJobIds.slice(-5000);
        chrome.storage.sync.set({ dismissedJobIds: recentJobIds });
        console.log(`Cleaned up sync storage: ${result.dismissedJobIds.length} -> ${recentJobIds.length} job IDs`);
      }
    });
  }
});

// Set up periodic cleanup (once per day)
chrome.alarms.create('cleanup-storage', { 
  delayInMinutes: 1440, // 24 hours
  periodInMinutes: 1440 
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