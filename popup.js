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
      runAllFeaturesBtn: document.getElementById('runAllFeatures'),
      showHiddenBtn: document.getElementById('showHidden'),
      statusDiv: document.getElementById('status')
    };
  }

  loadSettings() {
    chrome.storage.sync.get([
      'linkedinHiderEnabled',
      'linkedinDismissingEnabled', 
      'linkedinCompanyBlockingEnabled',
      'dismissKeywords',
      'blockedCompanies'
    ], (result) => {
      this.elements.enableHiding.checked = result.linkedinHiderEnabled !== false;
      this.elements.enableDismissing.checked = result.linkedinDismissingEnabled === true;
      this.elements.enableCompanyBlocking.checked = result.linkedinCompanyBlockingEnabled === true;
      
      this.keywords = result.dismissKeywords || this.getDefaultKeywords();
      this.companies = result.blockedCompanies || this.getDefaultCompanies();
      
      // Sort existing data alphabetically
      this.keywords.sort();
      this.companies.sort();
      
      this.renderTags();
      this.updateSectionVisibility();
      
      if (!result.dismissKeywords) {
        this.saveKeywords();
      }
      if (!result.blockedCompanies) {
        this.saveCompanies();
      }
    });
  }

  getDefaultKeywords() {
    return ['job title 1', 'job title 2', 'job title 3'];
  }

  getDefaultCompanies() {
    return ['company name 1', 'company name 2', 'company name 3'];
  }

  bindEvents() {
    // Store bound functions to avoid duplicates
    this.boundEvents = {
      toggleHiding: () => {
        this.toggleFeature('linkedinHiderEnabled', this.elements.enableHiding.checked, 'toggleHiding', 'Job hiding');
      },
      toggleDismissing: () => {
        this.toggleFeature('linkedinDismissingEnabled', this.elements.enableDismissing.checked, 'toggleDismissing', 'Auto-dismissing');
        this.updateSectionVisibility();
      },
      toggleCompanyBlocking: () => {
        this.toggleFeature('linkedinCompanyBlockingEnabled', this.elements.enableCompanyBlocking.checked, 'toggleCompanyBlocking', 'Company blocking');
        this.updateSectionVisibility();
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
      runAllFeatures: () => this.runAllFeatures(),
      showHidden: () => this.showHiddenJobs(),
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
    this.elements.enableDismissing.addEventListener('change', this.boundEvents.toggleDismissing);
    this.elements.enableCompanyBlocking.addEventListener('change', this.boundEvents.toggleCompanyBlocking);
    this.elements.addKeywordBtn.addEventListener('click', this.boundEvents.addKeyword);
    this.elements.keywordInput.addEventListener('keypress', this.boundEvents.keywordKeypress);
    this.elements.clearKeywordsBtn.addEventListener('click', this.boundEvents.clearKeywords);
    this.elements.addCompanyBtn.addEventListener('click', this.boundEvents.addCompany);
    this.elements.companyInput.addEventListener('keypress', this.boundEvents.companyKeypress);
    this.elements.clearCompaniesBtn.addEventListener('click', this.boundEvents.clearCompanies);
    this.elements.runAllFeaturesBtn.addEventListener('click', this.boundEvents.runAllFeatures);
    this.elements.showHiddenBtn.addEventListener('click', this.boundEvents.showHidden);
    this.elements.keywordTagsContainer.addEventListener('click', this.boundEvents.keywordContainerClick);
    this.elements.companyTagsContainer.addEventListener('click', this.boundEvents.companyContainerClick);
  }

  removeEventListeners() {
    if (!this.boundEvents) return;

    this.elements.enableHiding.removeEventListener('change', this.boundEvents.toggleHiding);
    this.elements.enableDismissing.removeEventListener('change', this.boundEvents.toggleDismissing);
    this.elements.enableCompanyBlocking.removeEventListener('change', this.boundEvents.toggleCompanyBlocking);
    this.elements.addKeywordBtn.removeEventListener('click', this.boundEvents.addKeyword);
    this.elements.keywordInput.removeEventListener('keypress', this.boundEvents.keywordKeypress);
    this.elements.clearKeywordsBtn.removeEventListener('click', this.boundEvents.clearKeywords);
    this.elements.addCompanyBtn.removeEventListener('click', this.boundEvents.addCompany);
    this.elements.companyInput.removeEventListener('keypress', this.boundEvents.companyKeypress);
    this.elements.clearCompaniesBtn.removeEventListener('click', this.boundEvents.clearCompanies);
    this.elements.runAllFeaturesBtn.removeEventListener('click', this.boundEvents.runAllFeatures);
    this.elements.showHiddenBtn.removeEventListener('click', this.boundEvents.showHidden);
    this.elements.keywordTagsContainer.removeEventListener('click', this.boundEvents.keywordContainerClick);
    this.elements.companyTagsContainer.removeEventListener('click', this.boundEvents.companyContainerClick);
  }

  toggleFeature(storageKey, enabled, action, featureName) {
    chrome.storage.sync.set({ [storageKey]: enabled });
    
    this.sendMessageToContentScript({
      action: action,
      enabled: enabled
    });
    
    this.showStatus(`${featureName} ${enabled ? 'enabled' : 'disabled'}`, 'success');
  }

  updateSectionVisibility() {
    this.elements.keywordsSection.classList.toggle('hidden', !this.elements.enableDismissing.checked);
    this.elements.companiesSection.classList.toggle('hidden', !this.elements.enableCompanyBlocking.checked);
  }

  addKeyword() {
    const keyword = this.elements.keywordInput.value.trim().toLowerCase();
    
    if (!keyword) {
      this.showStatus('Please enter a keyword', 'error');
      return;
    }
    
    if (this.keywords.includes(keyword)) {
      this.showStatus('Keyword already exists', 'error');
      return;
    }
    
    this.keywords.push(keyword);
    this.keywords.sort(); // Sort alphabetically
    this.renderKeywordTags();
    this.saveKeywords();
    this.elements.keywordInput.value = '';
    this.showStatus(`Added keyword: ${keyword}`, 'success');
  }

  addCompany() {
    const company = this.elements.companyInput.value.trim().toLowerCase();
    
    if (!company) {
      this.showStatus('Please enter a company name', 'error');
      return;
    }
    
    if (this.companies.includes(company)) {
      this.showStatus('Company already exists', 'error');
      return;
    }
    
    this.companies.push(company);
    this.companies.sort(); // Sort alphabetically
    this.renderCompanyTags();
    this.saveCompanies();
    this.elements.companyInput.value = '';
    this.showStatus(`Added company: ${company}`, 'success');
  }

  removeKeyword(keyword) {
    this.keywords = this.keywords.filter(k => k !== keyword);
    this.renderKeywordTags();
    this.saveKeywords();
    this.showStatus(`Removed keyword: ${keyword}`, 'success');
  }

  removeCompany(company) {
    this.companies = this.companies.filter(c => c !== company);
    this.renderCompanyTags();
    this.saveCompanies();
    this.showStatus(`Removed company: ${company}`, 'success');
  }

  clearKeywords() {
    this.keywords = [];
    this.renderKeywordTags();
    this.saveKeywords();
    this.showStatus('All keywords cleared', 'success');
  }

  clearCompanies() {
    this.companies = [];
    this.renderCompanyTags();
    this.saveCompanies();
    this.showStatus('All companies cleared', 'success');
  }

  renderTags() {
    this.renderKeywordTags();
    this.renderCompanyTags();
  }

  renderKeywordTags() {
    if (this.keywords.length === 0) {
      this.elements.keywordTagsContainer.innerHTML = '<div class="empty-state">No keywords added yet</div>';
      return;
    }

    this.elements.keywordTagsContainer.innerHTML = this.keywords
      .map(keyword => this.createTagHTML(keyword, 'removeKeyword'))
      .join('');
  }

  renderCompanyTags() {
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
    chrome.storage.sync.set({ dismissKeywords: this.keywords });
    this.sendMessageToContentScript({
      action: 'updateKeywords',
      keywords: this.keywords
    });
  }

  saveCompanies() {
    chrome.storage.sync.set({ blockedCompanies: this.companies });
    this.sendMessageToContentScript({
      action: 'updateCompanies',
      companies: this.companies
    });
  }

  runAllFeatures() {
    this.showStatus('Running all enabled features...', 'info');
    this.sendMessageToContentScript({
      action: 'runAllFeatures'
    }, (response) => {
      if (response && response.message) {
        this.showStatus(response.message, 'success');
      } else {
        this.showStatus('All features executed!', 'success');
      }
    });
  }

  showHiddenJobs() {
    this.sendMessageToContentScript({
      action: 'showHiddenJobs'
    }, (response) => {
      this.showStatus(response?.message || 'Hidden jobs restored!', 'success');
    });
  }

  // Enhanced message sending with better error handling and retry logic
  async sendMessageToContentScript(message, callback) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tabs[0]) {
        this.showStatus('No active tab found', 'error');
        return;
      }

      const currentTab = tabs[0];
      
      // Check if on LinkedIn
      if (!currentTab.url || !currentTab.url.includes('linkedin.com')) {
        this.showStatus('Please navigate to LinkedIn first', 'error');
        return;
      }

      // Check if tab is fully loaded
      if (currentTab.status !== 'complete') {
        this.showStatus('Page is still loading, please wait...', 'error');
        return;
      }

      try {
        // First, try to inject the content script if it's not already there
        await this.ensureContentScriptLoaded(currentTab.id);
        
        // Wait a moment for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Send the message
        const response = await chrome.tabs.sendMessage(currentTab.id, message);
        
        if (callback) {
          callback(response);
        }
        
      } catch (sendError) {
        console.error('Send message error:', sendError);
        
        // If message failed, try to reload content script and retry once
        if (sendError.message && sendError.message.includes('Could not establish connection')) {
          this.showStatus('Content script not found, trying to reload...', 'warning');
          
          try {
            await this.injectContentScript(currentTab.id);
            await new Promise(resolve => setTimeout(resolve, 500));
            const retryResponse = await chrome.tabs.sendMessage(currentTab.id, message);
            
            if (callback) {
              callback(retryResponse);
            }
            
          } catch (retryError) {
            console.error('Retry failed:', retryError);
            this.showStatus('Please refresh the LinkedIn page and try again', 'error');
          }
        } else {
          this.showStatus('Communication error. Please refresh the page.', 'error');
        }
      }
      
    } catch (error) {
      console.error('Tab query error:', error);
      this.showStatus('Error accessing tab. Please try again.', 'error');
    }
  }

  // Check if content script is loaded, inject if needed
  async ensureContentScriptLoaded(tabId) {
    try {
      // Try a simple ping to see if content script responds
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      // Content script not loaded, inject it
      await this.injectContentScript(tabId);
    }
  }

  // Inject content script programmatically
  async injectContentScript(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
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

    // Hide after 4 seconds (longer for better visibility)
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
