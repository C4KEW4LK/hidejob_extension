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
    this.bindStorageListener();
    // Set initial tab state on load
    this.handleTabClick(document.querySelector('.tab-button.active'));
  }

  cacheElements() {
    this.elements = {
      enableHiding: document.getElementById('enableHiding'),
      enableDismissing: document.getElementById('enableDismissing'),
      enableCompanyBlocking: document.getElementById('enableCompanyBlocking'),
      
      tabs: document.querySelectorAll('.tab-button'),
      tabContents: document.querySelectorAll('.tab-content'),

      keywordsSection: document.getElementById('keywordsSection'),
      keywordInput: document.getElementById('keywordInput'),
      addKeywordBtn: document.getElementById('addKeyword'),
      keywordTagsContainer: document.getElementById('keywordTags'),
      clearKeywordsBtn: document.getElementById('clearKeywords'),
      exportKeywordsBtn: document.getElementById('exportKeywords'),
      
      companiesSection: document.getElementById('companiesSection'),
      companyInput: document.getElementById('companyInput'),
      addCompanyBtn: document.getElementById('addCompany'),
      companyTagsContainer: document.getElementById('companyTags'),
      clearCompaniesBtn: document.getElementById('clearCompanies'),
      exportCompaniesBtn: document.getElementById('exportCompanies'),
      
      statusDiv: document.getElementById('status')
    };
  }

  loadSettings() {
    chrome.storage.sync.get([
      'linkedinHiderEnabled', 'linkedinDismissingEnabled', 'linkedinCompanyBlockingEnabled', 'dismissKeywords', 'blockedCompanies'
    ], (result) => {
      this.elements.enableHiding.checked = result.linkedinHiderEnabled !== false;
      this.elements.enableDismissing.checked = result.linkedinDismissingEnabled === true;
      this.elements.enableCompanyBlocking.checked = result.linkedinCompanyBlockingEnabled === true;
      this.keywords = result.dismissKeywords || [];
      this.companies = result.blockedCompanies || [];
      this.keywords.sort();
      this.companies.sort();
      this.renderTags();
    });
  }

  bindStorageListener() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'sync') return;

      const updates = {
        dismissKeywords: (value) => {
          this.keywords = value || [];
          this.keywords.sort();
          this.renderKeywordTags();
        },
        blockedCompanies: (value) => {
          this.companies = value || [];
          this.companies.sort();
          this.renderCompanyTags();
        },
        linkedinHiderEnabled: (value) => this.elements.enableHiding.checked = value !== false,
        linkedinDismissingEnabled: (value) => this.elements.enableDismissing.checked = value === true,
        linkedinCompanyBlockingEnabled: (value) => this.elements.enableCompanyBlocking.checked = value === true
      };

      for (const key in changes) {
        if (updates[key]) {
          updates[key](changes[key].newValue);
        }
      }
    });
  }

  handleTabClick(clickedTab) {
    if (!clickedTab) return;
    const targetId = clickedTab.dataset.target;
    
    this.elements.tabs.forEach(tab => tab.classList.remove('active'));
    this.elements.tabContents.forEach(content => content.classList.add('hidden'));

    clickedTab.classList.add('active');
    const targetContent = document.getElementById(targetId);
    if (targetContent) {
      targetContent.classList.remove('hidden');
    }
  }

  bindEvents() {
    this.boundEvents = {
      toggleHiding: () => this.toggleFeature('linkedinHiderEnabled', this.elements.enableHiding.checked, 'toggleHiding', 'Job hiding'),
      toggleDismissing: () => this.toggleFeature('linkedinDismissingEnabled', this.elements.enableDismissing.checked, 'toggleDismissing', 'Auto-dismissing'),
      toggleCompanyBlocking: () => this.toggleFeature('linkedinCompanyBlockingEnabled', this.elements.enableCompanyBlocking.checked, 'toggleCompanyBlocking', 'Company blocking'),
      addKeyword: () => this.addKeyword(),
      clearKeywords: () => this.clearKeywords(),
      exportKeywords: () => this.exportKeywords(),
      addCompany: () => this.addCompany(),
      clearCompanies: () => this.clearCompanies(),
      exportCompanies: () => this.exportCompanies(),
      keywordContainerClick: (e) => {
        if (e.target.classList.contains('remove-btn')) {
          e.stopPropagation();
          const keywordToRemove = e.target.dataset.keyword;
          if (keywordToRemove) this.removeKeyword(keywordToRemove);
        }
      },
      companyContainerClick: (e) => {
        if (e.target.classList.contains('remove-btn')) {
          e.stopPropagation();
          const companyToRemove = e.target.dataset.company;
          if (companyToRemove) this.removeCompany(companyToRemove);
        }
      },
      keywordKeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.addKeyword();
        }
      },
      companyKeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.addCompany();
        }
      }
    };

    // Main Toggles
    this.elements.enableHiding.addEventListener('change', this.boundEvents.toggleHiding);
    this.elements.enableDismissing.addEventListener('change', this.boundEvents.toggleDismissing);
    this.elements.enableCompanyBlocking.addEventListener('change', this.boundEvents.toggleCompanyBlocking);
    
    // Tabs
    this.elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => this.handleTabClick(tab));
    });

    // Keywords Section
    this.elements.addKeywordBtn.addEventListener('click', this.boundEvents.addKeyword);
    this.elements.keywordInput.addEventListener('keydown', this.boundEvents.keywordKeydown);
    this.elements.clearKeywordsBtn.addEventListener('click', this.boundEvents.clearKeywords);
    this.elements.exportKeywordsBtn.addEventListener('click', this.boundEvents.exportKeywords);
    
    // Companies Section
    this.elements.addCompanyBtn.addEventListener('click', this.boundEvents.addCompany);
    this.elements.companyInput.addEventListener('keydown', this.boundEvents.companyKeydown);
    this.elements.clearCompaniesBtn.addEventListener('click', this.boundEvents.clearCompanies);
    this.elements.exportCompaniesBtn.addEventListener('click', this.boundEvents.exportCompanies);
    
    // Event listeners for the tag containers
    this.elements.keywordTagsContainer.addEventListener('click', this.boundEvents.keywordContainerClick);
    this.elements.companyTagsContainer.addEventListener('click', this.boundEvents.companyContainerClick);
  }

  toggleFeature(storageKey, enabled, action, featureName) {
    chrome.storage.sync.set({ [storageKey]: enabled });
    this.sendMessageToContentScript({ action, enabled });
    this.showStatus(`${featureName} ${enabled ? 'enabled' : 'disabled'}`, 'success');
  }

  addKeyword() {
    const keywords = this.elements.keywordInput.value
      .split(/[\n,]+/)   // split on newlines or commas only
      .map(k => k.trim().toLowerCase().replace(/"/g, ''))
      .filter(k => k);
    if (!keywords.length) { this.showStatus('Please enter one or more keywords', 'error'); return; }
    let addedCount = 0;
    keywords.forEach(keyword => {
      if (!this.keywords.includes(keyword)) { this.keywords.push(keyword); addedCount++; }
    });
    if (addedCount > 0) {
      this.keywords.sort(); this.renderKeywordTags(); this.saveKeywords();
      this.elements.keywordInput.value = '';
      this.showStatus(`Added ${addedCount} new keyword(s)`, 'success');
    }
    else { this.showStatus('Keyword(s) already exist', 'error'); }
  }

  addCompany() {
    const companies = this.elements.companyInput.value
      .split(/[\n,]+/)   // split on newlines or commas only
      .map(c => c.trim().toLowerCase().replace(/"/g, ''))
      .filter(c => c);
    if (!companies.length) { this.showStatus('Please enter one or more company names', 'error'); return; }
    let addedCount = 0;
    companies.forEach(company => {
      if (!this.companies.includes(company)) { this.companies.push(company); addedCount++; }
    });
    if (addedCount > 0) {
      this.companies.sort(); this.renderCompanyTags(); this.saveCompanies();
      this.elements.companyInput.value = '';
      this.showStatus(`Added ${addedCount} new company/companies`, 'success');
    }
    else { this.showStatus('Company/companies already exist', 'error'); }
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
    this.keywords = []; this.renderKeywordTags(); this.saveKeywords(); this.showStatus('All keywords cleared', 'success');
  }

  clearCompanies() {
    this.companies = []; this.renderCompanyTags(); this.saveCompanies(); this.showStatus('All companies cleared', 'success');
  }

  exportKeywords() {
    if (this.keywords.length === 0) { this.showStatus('No keywords to export', 'error'); return; }
    const content = this.keywords.join('\n'); this.downloadFile(content, 'keywords.txt', 'text/plain');
  }

  exportCompanies() {
    if (this.companies.length === 0) { this.showStatus('No companies to export', 'error'); return; }
    const content = this.companies.join('\n'); this.downloadFile(content, 'companies.txt', 'text/plain');
  }

  downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file); a.download = fileName; a.click();
    URL.revokeObjectURL(a.href); this.showStatus(`Exported ${fileName}`, 'success');
  }

  renderTags() {
    this.renderKeywordTags();
    this.renderCompanyTags();
  }

  renderKeywordTags() {
    if (this.keywords.length === 0) { this.elements.keywordTagsContainer.innerHTML = '<div class="empty-state">No keywords added yet</div>'; return; }
    this.elements.keywordTagsContainer.innerHTML = this.keywords.map(keyword => this.createTagHTML(keyword, 'keyword')).join('');
  }

  renderCompanyTags() {
    if (this.companies.length === 0) { this.elements.companyTagsContainer.innerHTML = '<div class="empty-state">No companies added yet</div>'; return; }
    this.elements.companyTagsContainer.innerHTML = this.companies.map(company => this.createTagHTML(company, 'company')).join('');
  }

  createTagHTML(text, type) {
    return `<div class="keyword-item"><span class="keyword-text">${this.escapeHtml(text)}</span><button class="remove-btn" data-${type}="${this.escapeHtml(text)}">&times;</button></div>`;
  }

  escapeHtml(text) {
    const div = document.createElement('div'); div.textContent = text; return div.innerHTML;
  }

  saveKeywords() {
    chrome.storage.sync.set({ dismissKeywords: this.keywords });
    this.sendMessageToContentScript({ action: 'updateKeywords', keywords: this.keywords });
  }

  saveCompanies() {
    chrome.storage.sync.set({ blockedCompanies: this.companies });
    this.sendMessageToContentScript({ action: 'updateCompanies', companies: this.companies });
  }

  async sendMessageToContentScript(message, callback) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0] || !tabs[0].url || !tabs[0].url.includes('linkedin.com')) {
        this.showStatus('Please navigate to a LinkedIn page.', 'error'); return;
      }
      chrome.tabs.sendMessage(tabs[0].id, message, callback);
    } catch (error) { console.error('Error sending message:', error); this.showStatus('Communication error.', 'error'); }
  }

  showStatus(message, type = 'info') {
    this.elements.statusDiv.className = `status ${type}`;
    this.elements.statusDiv.textContent = message;
    this.elements.statusDiv.style.display = 'block';
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    this.statusTimeout = setTimeout(() => { this.elements.statusDiv.style.display = 'none'; }, 4000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new LinkedInJobManager();
});