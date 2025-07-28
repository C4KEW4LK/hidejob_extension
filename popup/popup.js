class LinkedInJobManager {
  constructor() {
    this.keywords = [];
    this.companies = [];
    this.elements = {};
    this.init();
  }

  init() {
    this.cacheElements();
    this.loadSettings();
    this.bindEvents();
  }

  cacheElements() {
    this.elements = {
      enableHiding: document.getElementById('enableHiding'),
      enableAutoDismissFromList: document.getElementById('enableAutoDismissFromList'),
      enableDismissing: document.getElementById('enableDismissing'),
      enableCompanyBlocking: document.getElementById('enableCompanyBlocking'),
      keywordsSection: document.getElementById('keywordsSection'),
      companiesSection: document.getElementById('companiesSection'),
      keywordInput: document.getElementById('keywordInput'),
      addKeywordBtn: document.getElementById('addKeyword'),
      keywordTagsContainer: document.getElementById('keywordTags'),
      clearKeywordsBtn: document.getElementById('clearKeywords'),
      companyInput: document.getElementById('companyInput'),
      addCompanyBtn: document.getElementById('addCompany'),
      companyTagsContainer: document.getElementById('companyTags'),
      clearCompaniesBtn: document.getElementById('clearCompanies'),
      statusDiv: document.getElementById('status'),
      clearDismissedBtn: document.getElementById('clearDismissed')
    };
  }

  loadSettings() {
    console.log('Loading settings...');
    // Load feature flags from sync storage
    chrome.storage.sync.get([
      'linkedinHiderEnabled',
      'linkedinAutoDismissFromListEnabled',
      'linkedinDismissingEnabled',
      'linkedinCompanyBlockingEnabled'
    ], (syncResult) => {
      console.log('Sync Storage Result:', syncResult);
      // Default to true for hiding (matching original), false for others
      this.elements.enableHiding.checked = syncResult.linkedinHiderEnabled !== false;
      this.elements.enableAutoDismissFromList.checked = syncResult.linkedinAutoDismissFromListEnabled === true;
      this.elements.enableDismissing.checked = syncResult.linkedinDismissingEnabled === true;
      this.elements.enableCompanyBlocking.checked = syncResult.linkedinCompanyBlockingEnabled === true;

      console.log('Toggles after loading:', {
        enableHiding: this.elements.enableHiding.checked,
        enableAutoDismissFromList: this.elements.enableAutoDismissFromList.checked,
        enableDismissing: this.elements.enableDismissing.checked,
        enableCompanyBlocking: this.elements.enableCompanyBlocking.checked
      });

      // Load keywords and companies from local storage
      chrome.storage.local.get([
        'dismissKeywords',
        'blockedCompanies'
      ], (localResult) => {
        console.log('Local Storage Result (Keywords/Companies):', localResult);
        this.keywords = localResult.dismissKeywords || this.getDefaultKeywords();
        this.companies = localResult.blockedCompanies || this.getDefaultCompanies();

        // Sort existing data alphabetically
        this.keywords.sort();
        this.companies.sort();

        this.renderTags();

        // Save defaults if they were just loaded
        if (!localResult.dismissKeywords) {
          this.saveKeywords();
        }
        if (!localResult.blockedCompanies) {
          this.saveCompanies();
        }
      });
    });
  }

  getDefaultKeywords() {
    return [];
  }

  getDefaultCompanies() {
    return [];
  }

  bindEvents() {
    // Store bound functions to avoid duplicates
    this.boundEvents = {
      toggleHiding: () => {
        const isEnabled = this.elements.enableHiding.checked;
        this.toggleFeature('linkedinHiderEnabled', isEnabled, 'toggleHiding', 'Hiding jobs from dismissed list');
      },
      toggleAutoDismissFromList: () => {
        this.toggleFeature('linkedinAutoDismissFromListEnabled', this.elements.enableAutoDismissFromList.checked, 'toggleAutoDismissFromList', 'Auto-dismissing from dismissed job IDs');
      },
      toggleDismissing: () => {
        this.toggleFeature('linkedinDismissingEnabled', this.elements.enableDismissing.checked, 'toggleDismissing', 'Auto-dismissing by keyword');
      },
      toggleCompanyBlocking: () => {
        this.toggleFeature('linkedinCompanyBlockingEnabled', this.elements.enableCompanyBlocking.checked, 'toggleCompanyBlocking', 'Company blocking');
      },
      addKeyword: () => this.addKeyword(),
      keywordKeypress: (e) => {
        if (e.key === 'Enter') this.addKeyword();
      },
      clearKeywords: () => this.clearKeywords(),
      addCompany: () => this.addCompany(),
      companyKeypress: (e) => {
        if (e.key === 'Enter') this.addCompany();
      },
      clearCompanies: () => this.clearCompanies(),
      clearDismissed: () => this.clearDismissedJobs(),
      keywordContainerClick: (e) => {
        if (e.target.classList.contains('remove-btn')) {
          e.stopPropagation();
          const keyword = e.target.dataset.keyword;
          if (keyword) {
            this.removeKeyword(keyword);
          }
        }
      },
      companyContainerClick: (e) => {
        if (e.target.classList.contains('remove-btn')) {
          e.stopPropagation();
          const company = e.target.dataset.company;
          if (company) {
            this.removeCompany(company);
          }
        }
      }
    };

    // Remove any existing listeners first
    this.removeEventListeners();

    // Add event listeners
    this.elements.enableHiding.addEventListener('change', this.boundEvents.toggleHiding);
    this.elements.enableAutoDismissFromList.addEventListener('change', this.boundEvents.toggleAutoDismissFromList);
    this.elements.enableDismissing.addEventListener('change', this.boundEvents.toggleDismissing);
    this.elements.enableCompanyBlocking.addEventListener('change', this.boundEvents.toggleCompanyBlocking);
    this.elements.addKeywordBtn.addEventListener('click', this.boundEvents.addKeyword);
    this.elements.keywordInput.addEventListener('keypress', this.boundEvents.keywordKeypress);
    this.elements.clearKeywordsBtn.addEventListener('click', this.boundEvents.clearKeywords);
    this.elements.addCompanyBtn.addEventListener('click', this.boundEvents.addCompany);
    this.elements.companyInput.addEventListener('keypress', this.boundEvents.companyKeypress);
    this.elements.clearCompaniesBtn.addEventListener('click', this.boundEvents.clearCompanies);
    this.elements.clearDismissedBtn.addEventListener('click', this.boundEvents.clearDismissed);
    this.elements.keywordTagsContainer.addEventListener('click', this.boundEvents.keywordContainerClick);
    this.elements.companyTagsContainer.addEventListener('click', this.boundEvents.companyContainerClick);
  }

  removeEventListeners() {
    if (!this.boundEvents) return;

    this.elements.enableHiding.removeEventListener('change', this.boundEvents.toggleHiding);
    this.elements.enableAutoDismissFromList.removeEventListener('change', this.boundEvents.toggleAutoDismissFromList);
    this.elements.enableDismissing.removeEventListener('change', this.boundEvents.toggleDismissing);
    this.elements.enableCompanyBlocking.removeEventListener('change', this.boundEvents.toggleCompanyBlocking);
    this.elements.addKeywordBtn.removeEventListener('click', this.boundEvents.addKeyword);
    this.elements.keywordInput.removeEventListener('keypress', this.boundEvents.keywordKeypress);
    this.elements.clearKeywordsBtn.removeEventListener('click', this.boundEvents.clearKeywords);
    this.elements.addCompanyBtn.removeEventListener('click', this.boundEvents.addCompany);
    this.elements.companyInput.removeEventListener('keypress', this.boundEvents.companyKeypress);
    this.elements.clearCompaniesBtn.removeEventListener('click', this.boundEvents.clearCompanies);
    this.elements.clearDismissedBtn.removeEventListener('click', this.boundEvents.clearDismissed);
    this.elements.keywordTagsContainer.removeEventListener('click', this.boundEvents.keywordContainerClick);
    this.elements.companyTagsContainer.removeEventListener('click', this.boundEvents.companyContainerClick);
  }

  toggleFeature(storageKey, enabled, action, featureName) {
    console.log(`🎛️ POPUP: Toggling feature: ${featureName}, Enabled: ${enabled}, Action: ${action}`);
    
    chrome.storage.sync.set({ [storageKey]: enabled }, () => {
      if (chrome.runtime.lastError) {
        console.error(`❌ POPUP: Error saving ${storageKey} to sync storage:`, chrome.runtime.lastError.message);
        this.showStatus(`Error saving ${featureName} setting`, 'error');
      } else {
        console.log(`✅ POPUP: ${storageKey} saved to sync storage as: ${enabled}`);
      }
    });

    console.log(`📤 POPUP: Sending message to content script:`, { action, enabled });

    this.sendMessageToContentScript({
      action: action,
      enabled: enabled
    }, (response) => {
      console.log(`📥 POPUP: Received response from content script:`, response);
      if (response && response.message) {
        this.showStatus(response.message, 'success');
      } else {
        this.showStatus(`${featureName} ${enabled ? 'enabled' : 'disabled'}`, 'success');
      }
    });
  }

  addKeyword() {
    const keyword = this.elements.keywordInput.value.trim().toLowerCase();
    console.log('Attempting to add keyword:', keyword);

    if (!keyword) {
      this.showStatus('Please enter a keyword', 'error');
      return;
    }

    if (this.keywords.includes(keyword)) {
      this.showStatus('Keyword already exists', 'error');
      return;
    }

    this.keywords.push(keyword);
    this.keywords.sort();
    console.log('Keywords array after adding:', this.keywords);
    this.renderKeywordTags();
    this.saveKeywords();
    this.elements.keywordInput.value = '';
    this.showStatus(`Added keyword: ${keyword}`, 'success');
  }

  addCompany() {
    const company = this.elements.companyInput.value.trim().toLowerCase();
    console.log('Attempting to add company:', company);

    if (!company) {
      this.showStatus('Please enter a company name', 'error');
      return;
    }

    if (this.companies.includes(company)) {
      this.showStatus('Company already exists', 'error');
      return;
    }

    this.companies.push(company);
    this.companies.sort();
    console.log('Companies array after adding:', this.companies);
    this.renderCompanyTags();
    this.saveCompanies();
    this.elements.companyInput.value = '';
    this.showStatus(`Added company: ${company}`, 'success');
  }

  removeKeyword(keyword) {
    this.keywords = this.keywords.filter(k => k !== keyword);
    console.log('Keywords array after removing:', this.keywords);
    this.renderKeywordTags();
    this.saveKeywords();
    this.showStatus(`Removed keyword: ${keyword}`, 'success');
  }

  removeCompany(company) {
    this.companies = this.companies.filter(c => c !== company);
    console.log('Companies array after removing:', this.companies);
    this.renderCompanyTags();
    this.saveCompanies();
    this.showStatus(`Removed company: ${company}`, 'success');
  }

  clearKeywords() {
    this.keywords = [];
    console.log('All keywords cleared:', this.keywords);
    this.renderKeywordTags();
    this.saveKeywords();
    this.showStatus('All keywords cleared', 'success');
  }

  clearCompanies() {
    this.companies = [];
    console.log('All companies cleared:', this.companies);
    this.renderCompanyTags();
    this.saveCompanies();
    this.showStatus('All companies cleared', 'success');
  }

  clearDismissedJobs() {
    this.showStatus('Clearing all dismissed job IDs...', 'info');
    this.sendMessageToContentScript({
      action: 'clearDismissedJobs'
    }, (response) => {
      this.showStatus(response?.message || 'All dismissed jobs cleared!', 'success');
    });
  }

  renderTags() {
    this.renderKeywordTags();
    this.renderCompanyTags();
  }

  renderKeywordTags() {
    console.log('Rendering keyword tags. Current keywords:', this.keywords);
    if (this.keywords.length === 0) {
      this.elements.keywordTagsContainer.innerHTML = '<div class="empty-state">No keywords added yet</div>';
      return;
    }

    this.elements.keywordTagsContainer.innerHTML = this.keywords
      .map(keyword => this.createTagHTML(keyword, 'removeKeyword'))
      .join('');
  }

  renderCompanyTags() {
    console.log('Rendering company tags. Current companies:', this.companies);
    if (this.companies.length === 0) {
      this.elements.companyTagsContainer.innerHTML = '<div class="empty-state">No companies added yet</div>';
      return;
    }

    this.elements.companyTagsContainer.innerHTML = this.companies
      .map(company => this.createTagHTML(company, 'removeCompany'))
      .join('');
  }

  createTagHTML(text, type) {
    const dataAttribute = type === 'removeKeyword' ? 'data-keyword' : 'data-company';
    return `
      <div class="keyword-item">
        <span class="keyword-text">${this.escapeHtml(text)}</span>
        <button class="remove-btn" ${dataAttribute}="${this.escapeHtml(text)}">&times;</button>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  saveKeywords() {
    console.log('Saving keywords to local storage:', this.keywords);
    chrome.storage.local.set({ dismissKeywords: this.keywords }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving keywords to local storage:', chrome.runtime.lastError.message);
      } else {
        console.log('Keywords saved to local storage successfully.');
      }
    });
    this.sendMessageToContentScript({
      action: 'updateKeywords',
      keywords: this.keywords
    });
  }

  saveCompanies() {
    console.log('Saving companies to local storage:', this.companies);
    chrome.storage.local.set({ blockedCompanies: this.companies }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving companies to local storage:', chrome.runtime.lastError.message);
      } else {
        console.log('Companies saved to local storage successfully.');
      }
    });
    this.sendMessageToContentScript({
      action: 'updateCompanies',
      companies: this.companies
    });
  }

  // FIXED: Enhanced message sending for current content script
  async sendMessageToContentScript(message, callback) {
    console.log(`📤 POPUP: Attempting to send message:`, message);
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tabs[0]) {
        console.error('❌ POPUP: No active tab found');
        this.showStatus('No active tab found', 'error');
        return;
      }

      const currentTab = tabs[0];
      console.log(`🏷️ POPUP: Current tab:`, currentTab.url);

      // Check if on LinkedIn
      if (!currentTab.url || !currentTab.url.includes('linkedin.com')) {
        console.error('❌ POPUP: Not on LinkedIn');
        this.showStatus('Please navigate to LinkedIn first', 'error');
        return;
      }

      // Check if tab is fully loaded
      if (currentTab.status !== 'complete') {
        console.error('❌ POPUP: Page still loading');
        this.showStatus('Page is still loading, please wait...', 'error');
        return;
      }

      try {
        console.log(`🔍 POPUP: Ensuring content script is loaded...`);
        // First, try to inject the content script if it's not already there
        await this.ensureContentScriptLoaded(currentTab.id);

        // Wait a moment for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`📤 POPUP: Sending message to tab ${currentTab.id}:`, message);
        // Send the message
        const response = await chrome.tabs.sendMessage(currentTab.id, message);
        console.log(`📥 POPUP: Received response:`, response);

        if (callback) {
          callback(response);
        }

      } catch (sendError) {
        console.error('❌ POPUP: Send message error:', sendError);

        // If message failed, try to reload content script and retry once
        if (sendError.message && sendError.message.includes('Could not establish connection')) {
          console.log('🔄 POPUP: Retrying with content script injection...');
          this.showStatus('Content script not found, trying to reload...', 'warning');

          try {
            await this.injectModularContentScripts(currentTab.id);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log(`🔄 POPUP: Retrying message send...`);
            const retryResponse = await chrome.tabs.sendMessage(currentTab.id, message);
            console.log(`📥 POPUP: Retry response:`, retryResponse);

            if (callback) {
              callback(retryResponse);
            }

          } catch (retryError) {
            console.error('❌ POPUP: Retry failed:', retryError);
            this.showStatus('Please refresh the LinkedIn page and try again', 'error');
          }
        } else {
          console.error('❌ POPUP: Other communication error:', sendError);
          this.showStatus('Communication error. Please refresh the page.', 'error');
        }
      }

    } catch (error) {
      console.error('❌ POPUP: Tab query error:', error);
      this.showStatus('Error accessing tab. Please try again.', 'error');
    }
  }

  // FIXED: Check if content script is loaded properly
  async ensureContentScriptLoaded(tabId) {
    try {
      // Try a simple ping to see if content script responds
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log('Content script ping successful');
    } catch (error) {
      console.log('Content script not loaded, injecting...');
      // Content script not loaded, inject it
      await this.injectModularContentScripts(tabId);
    }
  }

  // FIXED: Inject the correct content script file name
  async injectModularContentScripts(tabId) {
    try {
      // Inject the single optimized content script
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js'] // Updated to use the single file
      });

      console.log('Content script injected successfully');
    } catch (error) {
      console.error('Failed to inject content script:', error);
      throw error;
    }
  }

  showStatus(message, type) {
    this.elements.statusDiv.textContent = message;
    this.elements.statusDiv.className = `status ${type}`;
    this.elements.statusDiv.style.display = 'block';

    // Clear any existing timeout
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout);
    }

    // Hide after 4 seconds
    this.statusTimeout = setTimeout(() => {
      this.elements.statusDiv.style.display = 'none';
    }, 4000);
  }
}

// Initialize when DOM is ready - ensure only one instance
let linkedInJobManager = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!linkedInJobManager) {
    linkedInJobManager = new LinkedInJobManager();
  }
});

// Cleanup when popup is closed
window.addEventListener('beforeunload', () => {
  if (linkedInJobManager && linkedInJobManager.removeEventListeners) {
    linkedInJobManager.removeEventListeners();
  }
});