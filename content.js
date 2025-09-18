// LinkedIn Job Manager - Optimized Content Script
(function () {
  'use strict';

  if (window.LinkedInJobManager) return;

  // Configuration
  const CFG = {
    SEL: {
      job: '.job-card-container[data-job-id]',
      dismiss: 'button[aria-label*="Dismiss"]',
      company: '.job-card-container__primary-description',
      companyFb: ['.job-card-container__company-name', '.job-card-list__company-name', '[data-control-name="company_name"]', '.artdeco-entity-lockup__subtitle'],
      listItem: 'li.scaffold-layout__list-item',
      dismissed: '.job-card-list--is-dismissed',
      jobFb: ['[data-job-id]', '.job-card-container'],
      dismissFb: ['button[aria-label*="dismiss"]', 'button[aria-label*="undo"]', '.job-card-container__action button'],
      titleFb: ['.job-card-list__title', '.job-card-container__title', '[data-control-name="job_title"]', 'h3 a', 'a.job-card-list__title--link'],
      containers: ['.jobs-search-results-list', '.scaffold-layout__list-detail-inner', 'main']
    },
    INT: { detect: 400, hide: 300, process: 400, flush: 10000 },
    TIME: { process: 600000, undo: 10000, msg: 3000, minClick: 20, maxClick: 30, navDelay: 100, debounce: 100 },
    UI: { maxTitle: 60, topPos: 80, spacing: 80, zIndex: 10000 }
  };

  const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const ID_LENGTH = 6;

  // State
  const S = {
    int: { hide: null, process: null, detect: null, flush: null },
    time: { process: null },
    flags: { hiding: true, autoDismiss: false, keywords: false, companies: false },
    data: {
      keywords: [], companies: [], dismissed: new Set(), batch: new Set(),
      justUndone: new Set(),
      lastManual: null, prevJobs: new Set(), scriptDismissed: new Set(), pending: new Set()
    },
    stats: { dismissed: 0, hidden: 0, companyHidden: 0 },
    nav: { url: location.href, observer: null },
    dismissObs: null,
    cleanup: { controllers: new Set(), observers: new Set(), intervals: new Set(), timeouts: new Set() }
  };

  // Utilities
  const U = {
    isExt: () => { try { return chrome?.runtime?.id; } catch { return false; } },
    log: (msg, data) => console.log(`LinkedIn Job Manager: ${msg}`, data || ''),
    err: (ctx, e) => {
      if (e) {
        console.error(`LinkedIn Job Manager [${ctx}]:`, e);
      } else {
        console.error(`LinkedIn Job Manager [${ctx}]: An unknown or cross-origin error occurred.`);
      }
    },
    debounce: (fn, wait) => { let t; return (...args) => { clearTimeout(t); S.cleanup.timeouts.delete(t); t = setTimeout(() => { S.cleanup.timeouts.delete(t); fn(...args); }, wait); S.cleanup.timeouts.add(t); }; },
    sanitize: text => text && text.trim ? text.trim().toLowerCase() : '',
    escape: text => { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; },
    rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    safe: async (op, ctx, def = null) => { try { return await op(); } catch (e) { U.err(ctx, e); return def; } },

    query: (sels, cont = document) => {
      if (typeof sels === 'string') sels = [sels];
      for (const sel of sels) {
        try { const els = cont.querySelectorAll(sel); if (els.length) return [...els]; } catch (e) { U.err(`query ${sel}`, e); }
      }
      return [];
    },

    queryOne: (sels, cont = document) => U.query(sels, cont)[0] || null,

    controller: () => { const c = new AbortController(); S.cleanup.controllers.add(c); return c; },
    interval: (fn, delay) => { const id = setInterval(fn, delay); S.cleanup.intervals.add(id); return id; },
    timeout: (fn, delay) => { const id = setTimeout(() => { S.cleanup.timeouts.delete(id); fn(); }, delay); S.cleanup.timeouts.add(id); return id; },

    encodeJobId: number => {
      if (!number || isNaN(number)) return BASE64_CHARS[0].repeat(ID_LENGTH);
      let n = parseInt(number);
      if (n === 0) return BASE64_CHARS[0].repeat(ID_LENGTH);
      let encoded = "";
      while (n > 0) {
        encoded = BASE64_CHARS[n % 64] + encoded;
        n = Math.floor(n / 64);
      }
      return encoded.padStart(ID_LENGTH, BASE64_CHARS[0]);
    },

    decodeJobId: encoded => {
      if (!encoded || typeof encoded !== 'string') return null;
      let decoded = 0;
      for (let i = 0; i < encoded.length; i++) {
        const value = BASE64_CHARS.indexOf(encoded[i]);
        if (value === -1) return null;
        decoded = decoded * 64 + value;
      }
      return decoded;
    },

    validJobId: id => id && !isNaN(id) && parseInt(id) >= 0,

    addDismissed: id => {
      if (!U.validJobId(id)) return false;
      const encoded = U.encodeJobId(id);
      if (S.data.dismissed.has(encoded)) return false;
      S.data.dismissed.add(encoded);
      S.data.batch.add(encoded);
      return true;
    },

    isScript: id => {
      const encoded = typeof id === 'string' ? id : U.encodeJobId(id);
      return S.data.scriptDismissed.has(encoded) || S.data.pending.has(encoded);
    },

    debounce: (fn, wait) => { let t; return (...args) => { clearTimeout(t); S.cleanup.timeouts.delete(t); t = setTimeout(() => { S.cleanup.timeouts.delete(t); fn(...args); }, wait); S.cleanup.timeouts.add(t); }; },
    sanitize: text => text && text.trim ? text.trim().toLowerCase() : '',
    escape: text => { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; },
    rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    safe: async (op, ctx, def = null) => { try { return await op(); } catch (e) { U.err(ctx, e); return def; } },

    query: (sels, cont = document) => {
      if (typeof sels === 'string') sels = [sels];
      for (const sel of sels) {
        try { const els = cont.querySelectorAll(sel); if (els.length) return [...els]; } catch (e) { U.err(`query ${sel}`, e); }
      }
      return [];
    },

    queryOne: (sels, cont = document) => U.query(sels, cont)[0] || null,

    controller: () => { const c = new AbortController(); S.cleanup.controllers.add(c); return c; },
    interval: (fn, delay) => { const id = setInterval(fn, delay); S.cleanup.intervals.add(id); return id; },
    timeout: (fn, delay) => { const id = setTimeout(() => { S.cleanup.timeouts.delete(id); fn(); }, delay); S.cleanup.timeouts.add(id); return id; },

    validJobId: id => id && typeof id === 'string' && id.trim().length > 0,
    addDismissed: id => { if (!U.validJobId(id) || S.data.dismissed.has(id)) return false; S.data.dismissed.add(id); S.data.batch.add(id); return true; },
    isScript: id => S.data.scriptDismissed.has(id) || S.data.pending.has(id)
  };

  // NEW: Constants for sync storage chunking
  const SYNC_KEY_PREFIX = 'dismissed_chunk_';
  const MAX_SYNC_ITEMS = 8500; // Keep the most recent 5000 job IDs in sync
  const MAX_CHUNK_SIZE_BYTES = 8192; // 8kB per chunk
  const BASE64_ID_SIZE = ID_LENGTH + 3; // Base64 ID size plus JSON formatting overhead (quotes, comma, etc.)
  const SYNC_CHUNK_SIZE = 850; // Adjusted to allow for JSON storage overhead
  const MAX_SYNC_CHUNKS = Math.ceil(MAX_SYNC_ITEMS / SYNC_CHUNK_SIZE); // Recalculate chunk count based on new size

  // Storage Queue
  const Store = {
    queue: [], processing: false,

    add: op => new Promise((resolve, reject) => {
      Store.queue.push({ op, resolve, reject });
      Store.process();
    }),

    async process() {
      if (Store.processing || !Store.queue.length) return;
      Store.processing = true;
      while (Store.queue.length) {
        const { op, resolve, reject } = Store.queue.shift();
        try { resolve(await op()); } catch (e) { U.err('storage', e); reject(e); }
      }
      Store.processing = false;
    },

    async save() {
      if (!U.isExt() || !S.data.batch.size) return;
      return Store.add(async () => {
        // --- LOCAL STORAGE ---
        const localResult = await chrome.storage.local.get(['dismissedJobIds']);
        const localStored = new Set(localResult.dismissedJobIds || []);
        let localUpdated = false;
        for (const id of S.data.batch) {
          const encodedId = U.encodeJobId(id);
          if (!localStored.has(encodedId)) {
            localStored.add(encodedId);
            localUpdated = true;
          }
        }
        if (localUpdated) {
          await chrome.storage.local.set({ dismissedJobIds: [...localStored] });
          U.log(`Saved to local. Total: ${localStored.size}`);
        }

        // --- SYNC STORAGE ---
        const syncResult = await chrome.storage.sync.get(null);
        const syncStored = new Set();
        const existingChunkKeys = [];

        for (const key in syncResult) {
          if (key.startsWith(SYNC_KEY_PREFIX)) {
            existingChunkKeys.push(key);
            (syncResult[key] || []).forEach(id => syncStored.add(id));
          }
        }

        let syncUpdated = false;
        for (const id of S.data.batch) {
          const encodedId = U.encodeJobId(id);
          if (!syncStored.has(encodedId)) {
            syncStored.add(encodedId);
            syncUpdated = true;
          }
        }

        if (syncUpdated) {
          const recentIds = [...syncStored].slice(-MAX_SYNC_ITEMS);
          const newChunks = {};
          const newChunkKeys = [];

          for (let i = 0; i < Math.ceil(recentIds.length / SYNC_CHUNK_SIZE); i++) {
            const chunkKey = `${SYNC_KEY_PREFIX}${i}`;
            const start = i * SYNC_CHUNK_SIZE;
            const end = start + SYNC_CHUNK_SIZE;
            const chunkData = recentIds.slice(start, end);

            // Ensure the chunk size does not exceed the 8 KB limit
            let chunkSize = new Blob([JSON.stringify(chunkData)]).size;
            if (chunkSize > MAX_CHUNK_SIZE_BYTES) {
              U.err('save', new Error(`Chunk size exceeds 8 KB limit: ${chunkSize} bytes`));
              continue;
            }

            newChunks[chunkKey] = chunkData;
            newChunkKeys.push(chunkKey);
          }

          const keysToRemove = existingChunkKeys.filter(key => !newChunkKeys.includes(key));
          if (keysToRemove.length > 0) {
            await chrome.storage.sync.remove(keysToRemove);
          }

          await chrome.storage.sync.set(newChunks);
          U.log(`Saved to sync. Total: ${recentIds.length} IDs in ${newChunkKeys.length} chunks.`);
        }

        S.data.batch.clear();
      });
    },

    async load() {
      if (!U.isExt()) return;
      return U.safe(async () => {
        const [localResult, syncResult] = await Promise.all([
          chrome.storage.local.get(['dismissedJobIds', 'lastManuallyDismissedJobId']),
          chrome.storage.sync.get(null)
        ]);

        const allIds = new Set(localResult.dismissedJobIds || []);

        for (const key in syncResult) {
          if (key.startsWith(SYNC_KEY_PREFIX)) {
            (syncResult[key] || []).forEach(id => allIds.add(id));
          }
        }

        allIds.forEach(id => S.data.dismissed.add(id));
        U.log(`Loaded ${S.data.dismissed.size} dismissed job IDs from local and sync chunks`);

        if (localResult.lastManuallyDismissedJobId) S.data.lastManual = localResult.lastManuallyDismissedJobId;
      }, 'load');
    },

    async loadSettings() {
      if (!U.isExt()) { await Store.load(); return; }
      return U.safe(async () => {
        const sync = await chrome.storage.sync.get(['linkedinHiderEnabled', 'linkedinAutoDismissFromListEnabled', 'linkedinDismissingEnabled', 'linkedinCompanyBlockingEnabled', 'dismissKeywords', 'blockedCompanies']);
        S.flags.hiding = sync.linkedinHiderEnabled !== false;
        S.flags.autoDismiss = sync.linkedinAutoDismissFromListEnabled === true;
        S.flags.keywords = sync.linkedinDismissingEnabled === true;
        S.flags.companies = sync.linkedinCompanyBlockingEnabled === true;

        S.data.keywords = sync.dismissKeywords || [];
        S.data.companies = sync.blockedCompanies || [];
        await Store.load();
      }, 'loadSettings', Store.load);
    }
  };

  // Click Simulation
  async function click(el, jobId) {
    return U.safe(async () => {
      if (!el || !document.body.contains(el)) return false;
      if (jobId) {
        S.data.pending.add(jobId);
        el.setAttribute('data-auto-dismissing', 'true');
      }
      await new Promise(r => U.timeout(r, U.rand(CFG.TIME.minClick, CFG.TIME.maxClick)));
      try {
        el.click();
      } catch (e) {
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
          el.dispatchEvent(new MouseEvent(type, { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
        });
      }
      U.timeout(() => el?.removeAttribute?.('data-auto-dismissing'), 1000);
      return true;
    }, 'click', false);
  }

  // Job Operations
  const Jobs = {
    buttons: new WeakSet(),
    controllers: new WeakMap(),
    lastManualTime: 0,

    isAuto(btn, jobId, evt) {
      const encodedId = U.encodeJobId(jobId);
      if (evt && evt.isTrusted === false) {
        console.log(`AUTO: Untrusted event for job ${encodedId}`);
        return true;
      }

      if (U.isScript(encodedId) || btn.hasAttribute('data-auto-dismissing')) {
        console.log(`AUTO: Script flag or auto-dismissing attribute detected for job ${encodedId}`);
        return true;
      }

      const now = Date.now();
      if (now - this.lastManualTime < 50) {
        console.log(`AUTO: Rapid succession detected (${now - this.lastManualTime}ms gap) for job ${encodedId}`);
        this.lastManualTime = now;
        return true;
      }

      this.lastManualTime = now;
      console.log(`MANUAL: All checks passed for job ${encodedId}`);
      return false;
    },

    attach() {
      return U.safe(() => {
        const btns = U.query([CFG.SEL.dismiss, ...CFG.SEL.dismissFb]);
        let count = 0;

        btns.forEach(btn => {
          if (this.buttons.has(btn)) return;

          const wrap = btn.closest(CFG.SEL.job) || U.queryOne(CFG.SEL.jobFb, btn.parentElement);
          if (!wrap) return;

          const jobId = wrap.getAttribute('data-job-id');
          if (!jobId) return;

          const ctrl = U.controller();
          this.controllers.set(btn, ctrl);

          btn.addEventListener('click', evt => {
            console.log(`CLICK DETECTED on dismiss button for job ${jobId}`);

            if (this.isAuto(btn, jobId, evt)) {
              console.log(`CLICK IGNORED - Detected as auto-dismissal for job ID ${jobId}`);
              return;
            }

            console.log(`MANUAL CLICK CONFIRMED for job ID ${jobId}`);

            const title = this.extractTitle(wrap) ||
              (btn.getAttribute('aria-label') && typeof btn.getAttribute('aria-label') === 'string' ?
                btn.getAttribute('aria-label').replace(/dismiss|job/gi, '').trim() : '') ||
              `Job ${jobId}`;

            const companyName = this.extractCompany(wrap) || 'Unknown Company';
            console.log(`Extracted title: "${title}" & company: "${companyName}" for job ${jobId}`);

            const encodedId = U.encodeJobId(jobId);
            U.addDismissed(jobId);
            S.data.lastManual = encodedId;
            if (U.isExt()) chrome.storage.local.set({ lastManuallyDismissedJobId: encodedId });

            console.log(`DISPATCHING manualJobDismissed event for job ${jobId}`);
            window.dispatchEvent(new CustomEvent('manualJobDismissed', { detail: { jobId: encodedId, jobTitle: title, companyName: companyName } }));

          }, { capture: true, passive: true, signal: ctrl.signal });

          this.buttons.add(btn);
          count++;
        });

        if (count) {
          console.log(`Successfully attached listeners to ${count} new dismiss buttons`);
        }
        return count;
      }, 'attach', 0);
    },

    detectGone: U.debounce(function () {
      return U.safe(() => {
        const current = new Set();
        U.query([CFG.SEL.job, ...CFG.SEL.jobFb]).forEach(w => {
          const id = w.getAttribute('data-job-id');
          if (id) current.add(id);
        });

        let detected = 0;
        for (const id of S.data.prevJobs) {
          if (!current.has(id) && !S.data.dismissed.has(id) && !U.isScript(id)) {
            U.addDismissed(id);
            S.data.lastManual = id;
            detected++;
            if (U.isExt()) chrome.storage.sync.set({ lastManuallyDismissedJobId: id });
            window.dispatchEvent(new CustomEvent('manualJobDismissed', { detail: { jobId: id, jobTitle: `Job ${id}`, companyName: 'Unknown' } }));
          }
        }

        [...S.data.scriptDismissed].forEach(id => {
          if (!current.has(id)) {
            S.data.scriptDismissed.delete(id);
            S.data.pending.delete(id);
          }
        });

        const currentBtns = new Set(U.query([CFG.SEL.dismiss, ...CFG.SEL.dismissFb]));
        if (Jobs.controllers && Jobs.controllers.entries) {
          for (const [btn, ctrl] of Jobs.controllers.entries()) {
            if (!currentBtns.has(btn) || !document.body.contains(btn)) {
              ctrl.abort();
              S.cleanup.controllers.delete(ctrl);
              Jobs.controllers.delete(btn);
              Jobs.buttons.delete(btn);
            }
          }
        }

        S.data.prevJobs = current;
        return detected;
      }, 'detectGone', 0);
    }, CFG.TIME.debounce),

    init() {
      return U.safe(() => {
        S.data.prevJobs = new Set();
        U.query([CFG.SEL.job, ...CFG.SEL.jobFb]).forEach(w => {
          const id = w.getAttribute('data-job-id');
          if (id) S.data.prevJobs.add(id);
        });
        this.attach();
      }, 'init');
    },

    hide() {
      if (!S.flags.hiding) return 0;
      return U.safe(() => {
        let count = 0;
        const wraps = U.query([
          `${CFG.SEL.job}:not([data-hidden])`,
          ...CFG.SEL.jobFb.map(s => `${s}:not([data-hidden])`)
        ]);

        wraps.forEach(wrap => {
          const id = wrap.getAttribute('data-job-id');
          if (!id) return;

          // Check if job has been encoded when stored
          const encodedId = U.encodeJobId(id);

          // Check both encoded and raw IDs in the dismissed set
          const stored = S.data.dismissed.has(encodedId) ||
            S.data.dismissed.has(id) ||
            S.data.scriptDismissed.has(encodedId) ||
            S.data.scriptDismissed.has(id);

          const visual = wrap.classList.contains('job-card-list--is-dismissed') ||
            wrap.closest(CFG.SEL.dismissed) ||
            wrap.querySelector('[class*="dismissed"]') ||
            wrap.hasAttribute('data-script-dismissed');

          // Check if job should be hidden
          if ((stored || visual) &&
            !wrap.hasAttribute('data-just-undone') &&
            !wrap.hasAttribute('data-force-show') &&  // Respect force-show flag
            !S.data.justUndone.has(id) &&              // Check justUndone with raw ID
            !S.data.justUndone.has(encodedId)) {       // Also check with encoded ID

            const item = wrap.closest(CFG.SEL.listItem) || wrap.parentElement;
            if (item && item.style.display !== 'none') {
              item.style.display = 'none';
              item.setAttribute('data-hidden', 'true');
              wrap.setAttribute('data-hidden', 'true');

              // When hiding a visually dismissed job that's not in storage, add it
              if (!stored && !S.data.justUndone.has(id) && !S.data.justUndone.has(encodedId)) {
                U.addDismissed(id);
              }

              count++;
              S.stats.hidden++;
            }
          }
        });
        return count;
      }, 'hide', 0);
    },

    async process() {
      let dismissed = 0, companies = 0;
      if (!S.flags.keywords && !S.flags.companies && !S.flags.autoDismiss) return { dismissed: 0, companies: 0 };

      return U.safe(async () => {
        const wraps = U.query([CFG.SEL.job, ...CFG.SEL.jobFb]);
        if (!wraps.length) return { dismissed: 0, companies: 0 };

        for (const wrap of wraps) {
          const id = wrap.getAttribute('data-job-id');
          if (!id) continue;
          const btn = U.queryOne([CFG.SEL.dismiss, ...CFG.SEL.dismissFb], wrap);
          if (!btn || !document.body.contains(btn)) continue;

          wrap.setAttribute('data-processing', 'true');
          U.timeout(() => wrap.removeAttribute('data-processing'), 5000);

          const title = btn.getAttribute('aria-label') || 'N/A';
          const company = this.extractCompany(wrap);
          const visual = wrap.classList.contains('job-card-list--is-dismissed') ||
            wrap.closest(CFG.SEL.dismissed) || wrap.querySelector('[class*="dismissed"]');

          if (visual) {
            if (!S.data.dismissed.has(id)) { U.addDismissed(id); Store.save(); }
            continue;
          }
          if (U.isScript(id)) continue;

          if (S.flags.autoDismiss && S.data.dismissed.has(id)) {
            if (await click(btn, id)) {
              S.data.scriptDismissed.add(id);
              wrap.setAttribute('data-script-dismissed', 'true');
              dismissed++;
              S.stats.dismissed++;
            }
            U.timeout(() => S.data.pending.delete(id), 3000);
            await new Promise(r => U.timeout(r, U.rand(CFG.TIME.minClick, CFG.TIME.maxClick)));
            continue;
          }

          if (S.flags.companies && S.data.companies.length) {
            const match = this.findCompany(company);
            if (match) {
              if (await click(btn, id)) {
                S.data.scriptDismissed.add(id);
                wrap.setAttribute('data-script-dismissed', 'true');
                U.addDismissed(id);
                dismissed++;
                companies++;
                S.stats.dismissed++;
                S.stats.companyHidden++;
              }
              U.timeout(() => S.data.pending.delete(id), 3000);
              await new Promise(r => U.timeout(r, U.rand(CFG.TIME.minClick, CFG.TIME.maxClick)));
              continue;
            }
          }

          if (S.flags.keywords && S.data.keywords.length) {
            const label = btn.getAttribute('aria-label');
            if (label && typeof label === 'string') {
              const lower = U.sanitize(label);
              const match = S.data.keywords.find(kw => lower.includes(U.sanitize(kw)));
              if (match) {
                if (await click(btn, id)) {
                  S.data.scriptDismissed.add(id);
                  wrap.setAttribute('data-script-dismissed', 'true');
                  U.addDismissed(id);
                  dismissed++;
                  S.stats.dismissed++;
                }
                U.timeout(() => S.data.pending.delete(id), 3000);
                await new Promise(r => U.timeout(r, U.rand(CFG.TIME.minClick, CFG.TIME.maxClick)));
              }
            }
          }
        }
        return { dismissed, companies };
      }, 'process', { dismissed: 0, companies: 0 });
    },

    extractCompany(wrap) {
      try {
        let el = wrap.querySelector(CFG.SEL.company);
        if (el) return el.textContent.trim();

        for (const sel of CFG.SEL.companyFb) {
          el = wrap.querySelector(sel);
          if (el) {
            const text = el.textContent.trim();
            if (text.length > 0 && text.length < 100) return text;
          }
        }
        const subtitle = wrap.querySelector('.artdeco-entity-lockup__subtitle');
        if (subtitle) return subtitle.textContent.trim();

        return '';
      } catch (error) {
        U.err('extractCompany', error);
        return '';
      }
    },

    extractTitle(wrap) {
      try {
        const titleLink = wrap.querySelector('a.job-card-list__title--link');
        if (titleLink) {
          const visibleSpan = titleLink.querySelector('span[aria-hidden="true"]');
          if (visibleSpan) return visibleSpan.textContent.trim();
          return titleLink.textContent.trim();
        }

        const btn = U.queryOne([CFG.SEL.dismiss, ...CFG.SEL.dismissFb], wrap);
        if (btn) {
          const label = btn.getAttribute('aria-label');
          if (label && typeof label === 'string') {
            const match = label.match(/(?:Dismiss|undo)\s+(.+?)\s+job/i);
            if (match && match[1]) {
              const title = match[1].trim();
              if (title && !['this', 'the', 'a', 'an'].includes(title.toLowerCase())) return title;
            }
            const cleaned = label.replace(/dismiss|job|is dismissed, undo/gi, '').trim();
            if (cleaned && cleaned.length > 2) return cleaned;
          }
        }

        const titleSelectors = [
          '.job-card-list__title a span[aria-hidden="true"]', '.job-card-list__title a', '.job-card-list__title',
          '.job-card-container__title a', '.job-card-container__title', '[data-control-name="job_title"]',
          '.artdeco-entity-lockup__title a', 'h3 a span[aria-hidden="true"]', 'h3 a', 'h3', '.job-card-container__link'
        ];

        for (const sel of titleSelectors) {
          const el = wrap.querySelector(sel);
          if (el && el.textContent) {
            const title = el.textContent.trim();
            if (title && title.length > 2 && title.length < 200 && !title.match(/^\d+$/) && !title.includes('View job') && !title.includes('Apply')) {
              return title;
            }
          }
        }

        const parentSelectors = ['.job-card-container', '.job-card-list__item', '.jobs-search-results__list-item'];
        for (const parentSel of parentSelectors) {
          const parent = wrap.closest(parentSel) || wrap;
          for (const sel of titleSelectors) {
            const el = parent.querySelector(sel);
            if (el && el.textContent) {
              const title = el.textContent.trim();
              if (title && title.length > 2 && title.length < 200 && !title.match(/^\d+$/) && !title.includes('View job') && !title.includes('Apply')) {
                return title;
              }
            }
          }
        }
        return null;
      } catch (error) {
        U.err('extractTitle', error);
        return null;
      }
    },

    findCompany(detected) {
      if (!detected || typeof detected !== 'string') return null;
      const lower = U.sanitize(detected);
      return S.data.companies.find(c => {
        const blocked = U.sanitize(c);
        return lower.includes(blocked) || blocked.includes(lower);
      });
    },

    show() {
      return U.safe(() => {
        let count = 0;
        // Force unhide all jobs more aggressively
        U.query([CFG.SEL.job, ...CFG.SEL.jobFb]).forEach(wrap => {
          const item = wrap.closest(CFG.SEL.listItem) || wrap.parentElement;
          if (item) {
            item.style.display = '';
            item.removeAttribute('data-hidden');
          }
          wrap.style.display = '';
          wrap.removeAttribute('data-hidden');
          wrap.removeAttribute('data-script-dismissed');
          wrap.removeAttribute('data-auto-dismissing');
          wrap.classList.remove('job-card-list--is-dismissed');
          wrap.setAttribute('data-force-show', 'true');

          // Also clean up dismissed state from memory
          const id = wrap.getAttribute('data-job-id');
          if (id) {
            S.data.scriptDismissed.delete(id);
            S.data.pending.delete(id);
          }
          count++;
        });

        S.stats.hidden = 0;
        S.stats.companyHidden = 0;
        U.log(`Restored ${count} jobs`);
        return count;
      }, 'show', 0);
    },

    undo(specificId) {
      return U.safe(async () => {
        const id = specificId || S.data.lastManual;
        if (!id) {
          U.log('Undo failed: No recent dismissal to undo');
          return { success: false, message: 'No recent dismissal to undo' };
        }

        // Handle both encoded and raw IDs
        const encodedId = id.length === ID_LENGTH ? id : U.encodeJobId(id);
        const rawId = id.length === ID_LENGTH ? U.decodeJobId(id) : id;

        console.log(`Undoing dismissal for job ${rawId} (encoded: ${encodedId})`);
        const popupData = UI.popups.get(encodedId) || UI.popups.get(rawId);
        let title = popupData?.title;

        try {
          // Grant immunity to this job ID for 5 seconds
          S.data.justUndone.add(String(rawId));
          U.timeout(() => S.data.justUndone.delete(String(rawId)), 5000);

          // IMPORTANT FIX: Clean up from all storage locations using both formats
          // The dismissed set stores encoded IDs, so we must use encodedId to remove
          S.data.dismissed.delete(encodedId);
          S.data.dismissed.delete(String(rawId)); // Also try raw ID in case it was stored that way

          // Clean up from script dismissed sets
          S.data.scriptDismissed.delete(encodedId);
          S.data.scriptDismissed.delete(String(rawId));
          S.data.pending.delete(encodedId);
          S.data.pending.delete(String(rawId));
          S.data.batch.delete(encodedId);
          S.data.batch.delete(String(rawId));

          // Force a storage update to remove the ID
          if (U.isExt()) {
            await Store.add(async () => {
              const localResult = await chrome.storage.local.get(['dismissedJobIds']);
              const localStored = new Set(localResult.dismissedJobIds || []);

              // Remove both encoded and raw formats
              localStored.delete(encodedId);
              localStored.delete(String(rawId));

              await chrome.storage.local.set({ dismissedJobIds: [...localStored] });

              // Also update sync storage
              const syncResult = await chrome.storage.sync.get(null);
              let syncUpdated = false;

              for (const key in syncResult) {
                if (key.startsWith(SYNC_KEY_PREFIX)) {
                  const chunk = syncResult[key] || [];
                  const filteredChunk = chunk.filter(id => id !== encodedId && id !== String(rawId));
                  if (filteredChunk.length !== chunk.length) {
                    syncResult[key] = filteredChunk;
                    syncUpdated = true;
                  }
                }
              }

              if (syncUpdated) {
                await chrome.storage.sync.set(syncResult);
              }
            });
          }

          const wrap = U.queryOne([
            `${CFG.SEL.job}[data-job-id="${rawId}"]`,
            `${CFG.SEL.job}[data-job-id="${encodedId}"]`,
            ...CFG.SEL.jobFb.map(s => `${s}[data-job-id="${rawId}"]`),
            ...CFG.SEL.jobFb.map(s => `${s}[data-job-id="${encodedId}"]`)
          ]);

          if (!title) {
            title = this.extractTitle(wrap) || `Job ${rawId}`;
          }

          if (wrap) {
            // Try to find the undo button using more comprehensive matching
            const buttons = U.query(['button[aria-label*="undo"]', 'button[aria-label*="dismissed"]'], wrap);
            const matchingButton = buttons.find(btn => {
              const label = btn.getAttribute('aria-label');
              if (!label) return false;
              const labelLower = label.toLowerCase();
              return labelLower.includes('undo') && (
                labelLower.includes(`job ${rawId}`) ||
                labelLower.includes(title.toLowerCase()) ||
                labelLower.includes('this job') ||
                labelLower.includes('dismissed')
              );
            });

            if (matchingButton) {
              await click(matchingButton);
            }

            // Always force the job to be visible regardless of button click success
            const item = wrap.closest(CFG.SEL.listItem) || wrap.parentElement;
            if (item) {
              item.style.display = '';
              item.removeAttribute('data-hidden');
            }
            wrap.style.display = '';
            wrap.removeAttribute('data-hidden');
            wrap.removeAttribute('data-script-dismissed');
            wrap.setAttribute('data-just-undone', 'true');
            wrap.setAttribute('data-force-show', 'true'); // Add force-show flag
            wrap.classList.remove('job-card-list--is-dismissed');

            // Remove the flags after a delay to allow UI to update
            U.timeout(() => {
              wrap.removeAttribute('data-just-undone');
              // Keep data-force-show until hiding is disabled or page is refreshed
            }, 2000);
          }

          if (U.isExt()) {
            await Store.add(async () => {
              await chrome.storage.local.set({
                lastManuallyDismissedJobId: specificId ? S.data.lastManual : null
              });
            });
          }

          if (!specificId || specificId === S.data.lastManual) {
            S.data.lastManual = null;
          }

          return {
            success: true,
            message: `Restored "${title}"`,
            jobId: rawId,
            jobTitle: title
          };

        } catch (error) {
          U.err('Undo operation', error);
          return { success: false, message: 'Error undoing dismissal' };
        }
      }, 'undo', { success: false, message: 'Error undoing dismissal' });
    }
  };

  // UI Components
  const UI = {
    popups: new Map(),
    controllers: new Map(),

    addStyles() {
      if (document.getElementById('ljm-styles')) return;
      const style = document.createElement('style');
      style.id = 'ljm-styles';
      style.textContent = `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        @keyframes popupSlideIn { from { transform: translateX(100%) scale(0.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
        @keyframes popupSlideOut { from { transform: translateX(0) scale(1); opacity: 1; } to { transform: translateX(100%) scale(0.9); opacity: 0; } }
        .ljm-popup {
          transition: all 0.2s ease;
          will-change: transform;
        }
      `;
      document.head.appendChild(style);
    },

    createPopup(jobId, title, companyName) {
      console.log(`Creating popup for job ${jobId}: "${title}" from company: "${companyName}"`);
      this.removePopup(jobId);

      const popup = document.createElement('div');
      popup.id = `ljm-undo-${jobId}`;
      popup.className = 'ljm-popup';

      const posIndex = this.popups.size;
      const topPos = CFG.UI.topPos + (posIndex * CFG.UI.spacing);
      const shortTitle = title.length > CFG.UI.maxTitle ? title.substring(0, CFG.UI.maxTitle) + '...' : title;
      const displayCompany = companyName || 'Dismissal';

      popup.style.cssText = `
            position: fixed !important; top: ${topPos}px !important; right: 20px !important;
            z-index: ${CFG.UI.zIndex + posIndex} !important; min-width: 280px !important; max-width: 320px !important;
            display: block !important; visibility: visible !important; opacity: 1 !important;
            background: linear-gradient(135deg, #0a66c2 0%, #004182 100%) !important; color: white !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important; padding: 12px 16px !important; border-radius: 10px !important;
            cursor: pointer !important; box-shadow: 0 4px 15px rgba(10, 102, 194, 0.3) !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            animation: popupSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
            backdrop-filter: blur(10px) !important; transition: all 0.2s ease !important;
        `;

      popup.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px; font-weight: bold;">Undo</span>
            <div style="display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2;">
                <span style="font-weight: 600; font-size: 13px;">${U.escape(shortTitle)}</span>
                <span style="font-weight: 400; font-size: 11px; opacity: 0.9; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${U.escape(displayCompany)}</span>
            </div>
            </div>
        `;

      document.body.appendChild(popup);

      const ctrl = U.controller();
      this.controllers.set(jobId, ctrl);
      this.popups.set(jobId, { element: popup, position: posIndex, timeout: null, title, companyName });
      const { signal } = ctrl;

      popup.addEventListener('click', async () => {
        console.log(`Undo button clicked for job ${jobId}`);
        const result = await Jobs.undo(jobId);
        this.removePopup(jobId);

        if (result.success) {
          this.showMessage(`Success: Job "${result.jobTitle || shortTitle}" restored`, 'success');
        } else {
          this.showMessage(`Error: ${result.message}`, 'error');
        }
      }, { signal });

      popup.addEventListener('mouseenter', () => {
        popup.style.background = 'linear-gradient(135deg, #004182 0%, #002a5c 100%)';
        popup.style.transform = 'translateX(-5px) scale(1.02)';
      }, { signal });

      popup.addEventListener('mouseleave', () => {
        popup.style.background = 'linear-gradient(135deg, #0a66c2 0%, #004182 100%)';
        popup.style.transform = 'translateX(0) scale(1)';
      }, { signal });

      const close = document.createElement('button');
      close.innerHTML = '×';
      close.style.cssText = `
            position: absolute; top: 4px; right: 6px; background: none; border: none;
            color: rgba(255, 255, 255, 0.7); font-size: 18px; cursor: pointer; width: 24px; height: 24px;
            display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s ease;
        `;
      close.addEventListener('mouseenter', () => { close.style.background = 'rgba(255, 255, 255, 0.2)'; close.style.color = 'white'; }, { signal });
      close.addEventListener('mouseleave', () => { close.style.background = 'none'; close.style.color = 'rgba(255, 255, 255, 0.7)'; }, { signal });
      close.addEventListener('click', e => {
        e.stopPropagation();
        this.removePopup(jobId);
      }, { signal });
      popup.appendChild(close);

      const data = this.popups.get(jobId);
      if (data) {
        data.timeout = U.timeout(() => {
          this.removePopup(jobId);
        }, CFG.TIME.undo);
      }
    },

    removePopup(jobId) {
      const data = this.popups.get(jobId);
      if (!data) return;
      if (data.timeout) { clearTimeout(data.timeout); S.cleanup.timeouts.delete(data.timeout); }
      const ctrl = this.controllers.get(jobId);
      if (ctrl) { ctrl.abort(); S.cleanup.controllers.delete(ctrl); this.controllers.delete(jobId); }
      if (data.element?.parentNode) {
        data.element.style.animation = 'popupSlideOut 0.3s ease forwards';
        U.timeout(() => data.element.parentNode?.removeChild(data.element), 300);
      }
      this.popups.delete(jobId);
      this.reposition();
    },

    removeAll() {
      for (const [id, data] of this.popups) {
        if (data.timeout) { clearTimeout(data.timeout); S.cleanup.timeouts.delete(data.timeout); }
        const ctrl = this.controllers.get(id);
        if (ctrl) { ctrl.abort(); S.cleanup.controllers.delete(ctrl); }
        if (data.element?.parentNode) {
          data.element.style.animation = 'popupSlideOut 0.3s ease forwards';
          U.timeout(() => data.element.parentNode?.removeChild(data.element), 300);
        }
      }
      this.popups.clear();
      this.controllers.clear();
    },

    reposition() {
      const remaining = [...this.popups.entries()].sort((a, b) => a[1].position - b[1].position);
      remaining.forEach(([id, data], i) => {
        const newTop = CFG.UI.topPos + (i * CFG.UI.spacing);
        if (data.element) {
          data.element.style.top = `${newTop}px`;
          data.element.style.zIndex = `${CFG.UI.zIndex + i}`;
        }
        data.position = i;
      });
    },

    show(jobId, title, companyName) {
      console.log(`UI.show called with jobId: ${jobId}, title: "${title}", company: "${companyName}"`);

      if (U.isScript(jobId)) {
        console.log(`Not showing popup - job ${jobId} is script dismissed`);
        return;
      }

      const wrap = U.queryOne([`${CFG.SEL.job}[data-job-id="${jobId}"]`, ...CFG.SEL.jobFb.map(s => `${s}[data-job-id="${jobId}"]`)]);

      const finalTitle = title || Jobs.extractTitle(wrap) || `Job ${jobId}`;
      const finalCompany = companyName || Jobs.extractCompany(wrap) || 'Dismissal';

      console.log(`Creating popup for job ${jobId}: "${finalTitle}" from company "${finalCompany}"`);
      this.createPopup(jobId, finalTitle, finalCompany);
    },

    showMessage(msg, type = 'info') {
      const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
      const div = document.createElement('div');
      const topPos = CFG.UI.topPos + (this.popups.size * CFG.UI.spacing) + 20;
      div.style.cssText = `
        position: fixed; top: ${topPos}px; right: 20px;
        z-index: ${CFG.UI.zIndex + 100 + this.popups.size}; background: ${colors[type] || colors.info}; color: white;
        padding: 16px 20px; border-radius: 8px; font-size: 14px; font-weight: 500;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease; max-width: 350px; word-wrap: break-word; line-height: 1.4;
        border: 1px solid rgba(255, 255, 255, 0.1);
      `;
      div.textContent = msg;
      document.body.appendChild(div);

      U.timeout(() => {
        div.style.animation = 'slideOut 0.3s ease';
        U.timeout(() => div.parentNode?.removeChild(div), 300);
      }, CFG.TIME.msg + 1000);
    }
  };

  // Controls
  const Controls = {
    startDetect() {
      if (S.int.detect) return;
      Jobs.init();
      S.int.detect = U.interval(() => { Jobs.attach(); Jobs.detectGone(); }, CFG.INT.detect);
      this.setupObserver();
    },

    setupObserver() {
      if (S.dismissObs) { S.dismissObs.disconnect(); S.cleanup.observers.delete(S.dismissObs); }
      S.dismissObs = new MutationObserver(U.debounce(muts => {
        let needsUpdate = false;
        for (const mut of muts) {
          if (mut.type === 'childList' && mut.addedNodes.length) {
            const hasNew = [...mut.addedNodes].some(node => {
              if (node.nodeType !== 1) return false;
              const sels = [CFG.SEL.dismiss, ...CFG.SEL.dismissFb, CFG.SEL.job, ...CFG.SEL.jobFb];
              return sels.some(sel => {
                try { return (node.matches?.(sel)) || (node.querySelector?.(sel)) || (node.closest?.(sel)); } catch { return false; }
              });
            });
            if (hasNew) { needsUpdate = true; break; }
          }
        }
        if (needsUpdate) { Jobs.attach(); Jobs.detectGone(); if (S.flags.hiding) Jobs.hide(); }
      }, CFG.TIME.debounce));

      const container = U.queryOne(CFG.SEL.containers) || document.body;
      S.dismissObs.observe(container, { childList: true, subtree: true });
      S.cleanup.observers.add(S.dismissObs);
    },

    startHide() {
      if (!S.flags.hiding || S.int.hide) return;
      // When enabling hiding, remove force-show flags to allow hiding again.
      U.query([CFG.SEL.job, ...CFG.SEL.jobFb]).forEach(wrap => {
        wrap.removeAttribute('data-force-show');
      });
      Jobs.hide();
      S.int.hide = U.interval(() => { if (S.flags.hiding) Jobs.hide(); }, CFG.INT.hide);
    },

    stopHide() {
      if (S.int.hide) { clearInterval(S.int.hide); S.cleanup.intervals.delete(S.int.hide); S.int.hide = null; }
    },

    async startProcess() {
      if (S.int.process || (!S.flags.keywords && !S.flags.companies && !S.flags.autoDismiss)) return;
      await Jobs.process();
      S.int.process = U.interval(async () => {
        try { await Jobs.process(); } catch (e) { U.err('process cycle', e); }
      }, CFG.INT.process);
      if (S.time.process) { clearTimeout(S.time.process); S.cleanup.timeouts.delete(S.time.process); }
      S.time.process = U.timeout(() => this.stopProcess(), CFG.TIME.process);
    },

    stopProcess() {
      if (S.int.process) { clearInterval(S.int.process); S.cleanup.intervals.delete(S.int.process); S.int.process = null; }
      if (S.time.process) { clearTimeout(S.time.process); S.cleanup.timeouts.delete(S.time.process); S.time.process = null; }
    },

    stopDetect() {
      if (S.int.detect) {
        clearInterval(S.int.detect);
        S.cleanup.intervals.delete(S.int.detect);
        S.int.detect = null;
      }
      if (S.dismissObs) {
        S.dismissObs.disconnect();
        S.cleanup.observers.delete(S.dismissObs);
        S.dismissObs = null;
      }
    },

    restart() {
      this.stopDetect();
      this.stopHide();
      this.stopProcess();

      this.startDetect();
      if (S.flags.hiding) this.startHide(); else Jobs.show();
      if (S.flags.keywords || S.flags.companies || S.flags.autoDismiss) this.startProcess();
    }
  };

  // Navigation
  const Nav = {
    setup() {
      if (S.nav.observer) { S.nav.observer.disconnect(); S.cleanup.observers.delete(S.nav.observer); }

      const reinit = U.debounce(() => {
        U.log(`Re-initializing for new page: ${S.nav.url}`);
        Controls.restart();
      }, 500);

      S.nav.observer = new MutationObserver(() => {
        if (location.href !== S.nav.url) {
          U.log(`Navigation detected from ${S.nav.url} to ${location.href}.`);
          S.nav.url = location.href;

          Controls.stopDetect();
          S.data.prevJobs.clear();
          UI.removeAll();

          reinit();
        }
      });

      S.nav.observer.observe(document.body, { childList: true, subtree: true });
      S.cleanup.observers.add(S.nav.observer);
    }
  };

  // Messaging
  const Msg = {
    setup() {
      if (!U.isExt()) return;
      chrome.runtime.onMessage.addListener((req, sender, send) => {
        U.safe(async () => await this.handle(req, send), 'messaging').catch(e => send({ message: 'Error', error: e.message }));
        return true;
      });
    },

    setupStorageListener() {
      if (!U.isExt()) return;
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'sync') return;

        let settingsChanged = false;
        const keysToUpdate = {
          dismissKeywords: (value) => { S.data.keywords = value || []; U.log('Keywords updated via sync'); },
          blockedCompanies: (value) => { S.data.companies = value || []; U.log('Companies updated via sync'); },
          linkedinHiderEnabled: (value) => S.flags.hiding = value !== false,
          linkedinDismissingEnabled: (value) => S.flags.keywords = value === true,
          linkedinCompanyBlockingEnabled: (value) => S.flags.companies = value === true
        };

        for (const key in changes) {
          if (keysToUpdate[key]) {
            keysToUpdate[key](changes[key].newValue);
            settingsChanged = true;
          }
        }

        if (settingsChanged) {
          U.log('Settings changed from sync, restarting services.');
          Controls.restart();
        }
      });
    },

    async handle(req, send) {
      const { action } = req;
      switch (action) {
        case 'ping': send({ status: 'ready' }); break;
        case 'toggleHiding':
          S.flags.hiding = req.enabled;
          Controls.restart();
          send({ message: S.flags.hiding ? 'Hiding started' : 'Hiding stopped, jobs restored' });
          break;
        case 'toggleAutoDismissFromList':
          S.flags.autoDismiss = req.enabled;
          Controls.restart();
          send({ message: S.flags.autoDismiss ? 'Auto-dismiss from list started' : 'Auto-dismiss from list stopped' });
          break;
        case 'toggleDismissing':
          S.flags.keywords = req.enabled;
          Controls.restart();
          send({ message: S.flags.keywords ? 'Keyword dismissing started' : 'Keyword dismissing stopped' });
          break;
        case 'toggleCompanyBlocking':
          S.flags.companies = req.enabled;
          Controls.restart();
          send({ message: S.flags.companies ? 'Company blocking started' : 'Company blocking stopped' });
          break;
        case 'updateKeywords':
          S.data.keywords = req.keywords || [];
          if (U.isExt()) await Store.add(() => chrome.storage.sync.set({ dismissKeywords: S.data.keywords }));
          Controls.restart();
          send({ message: `Updated to ${S.data.keywords.length} keywords` });
          break;
        case 'updateCompanies':
          S.data.companies = req.companies || [];
          if (U.isExt()) await Store.add(() => chrome.storage.sync.set({ blockedCompanies: S.data.companies }));
          Controls.restart();
          send({ message: `Updated to ${S.data.companies.length} companies` });
          break;
        case 'detectManualDismissals':
          const detected = Jobs.detectGone();
          send({ message: `Detected ${detected} manually dismissed job(s)` });
          break;
        case 'hideJobsNow':
          const hidden = Jobs.hide();
          send({ message: `Hidden ${hidden} dismissed job card(s)` });
          break;
        case 'dismissJobsNow':
          try {
            const result = await Jobs.process();
            send({ message: `Dismissed ${result.dismissed} keyword job(s), ${result.companies} company job(s)` });
          } catch (e) { send({ message: 'Error dismissing jobs' }); }
          break;
        case 'showHiddenJobs':
          const restored = Jobs.show();
          send({ message: `Restored ${restored} hidden job card(s)` });
          break;
        case 'clearDismissedJobs':
          S.data.dismissed.clear(); S.data.batch.clear(); S.data.lastManual = null;
          S.data.scriptDismissed.clear(); S.data.pending.clear();
          if (U.isExt()) {
            await Store.add(async () => {
              await chrome.storage.local.set({ dismissedJobIds: [], lastManuallyDismissedJobId: null });
              const syncItems = await chrome.storage.sync.get(null);
              const keysToRemove = Object.keys(syncItems).filter(key => key.startsWith(SYNC_KEY_PREFIX));
              if (keysToRemove.length > 0) {
                await chrome.storage.sync.remove(keysToRemove);
              }
            });
          }
          Jobs.show();
          send({ message: 'Cleared all dismissed jobs' });
          break;
        case 'undoLastDismissal':
          send(await Jobs.undo());
          break;
        case 'getStats':
          send({
            dismissedJobs: S.data.dismissed.size, totalDismissed: S.stats.dismissed, totalHidden: S.stats.hidden,
            totalCompanyHidden: S.stats.companyHidden, lastManuallyDismissedJobId: S.data.lastManual, canUndo: !!S.data.lastManual
          });
          break;
        default: send({ message: 'Unknown action' });
      }
    }
  };

  // Cleanup
  const Cleanup = {
    all() {
      U.log('Cleaning up...');
      [...S.cleanup.intervals].forEach(clearInterval);
      [...S.cleanup.timeouts].forEach(clearTimeout);
      [...S.cleanup.controllers].forEach(c => { try { c.abort(); } catch { } });
      [...S.cleanup.observers].forEach(o => { try { o.disconnect(); } catch { } });
      S.cleanup.intervals.clear(); S.cleanup.timeouts.clear(); S.cleanup.controllers.clear(); S.cleanup.observers.clear();
      Object.keys(S.int).forEach(k => { if (S.int[k]) { clearInterval(S.int[k]); S.int[k] = null; } });
      Object.keys(S.time).forEach(k => { if (S.time[k]) { clearTimeout(S.time[k]); S.time[k] = null; } });
      if (S.dismissObs) { S.dismissObs.disconnect(); S.dismissObs = null; }
      if (S.nav.observer) { S.nav.observer.disconnect(); S.nav.observer = null; }
      Store.save();
      U.log('Cleanup complete');
    },

    setup() {
      ['beforeunload', 'pagehide'].forEach(e => window.addEventListener(e, () => this.all()));
      document.addEventListener('visibilitychange', () => { if (document.hidden) Store.save(); });
    }
  };

  // Main Manager
  class Manager {
    constructor() { this.initialized = false; this.startTime = Date.now(); }

    async init() {
      if (this.initialized) return;
      return U.safe(async () => {
        U.log('Initializing...');

        const extensionId = chrome.runtime.id;
        window.addEventListener('error', e => {
          if (e.filename && e.filename.includes(extensionId)) {
            U.err('unhandled', e.error || e.message);
          }
        });
        window.addEventListener('unhandledrejection', e => {
          U.err('unhandled promise', e.reason);
        });

        Cleanup.setup();
        UI.addStyles();
        Msg.setup();
        Msg.setupStorageListener();
        Nav.setup();
        await this.loadAndStart();
        this.initialized = true;
        U.log(`Initialized in ${Date.now() - this.startTime}ms`);
      }, 'init');
    }

    async loadAndStart() {
      return U.safe(async () => {
        await Store.loadSettings();
        this.startServices();
      }, 'loadAndStart');
    }

    startServices() {
      return U.safe(() => {
        Controls.startDetect();
        if (S.flags.hiding) Controls.startHide(); else U.timeout(() => Jobs.show(), 500);
        if (S.flags.keywords || S.flags.companies || S.flags.autoDismiss) Controls.startProcess();
        S.int.flush = U.interval(() => Store.save(), CFG.INT.flush);
        U.log('Services started');
      }, 'startServices');
    }

    getStatus() {
      return {
        initialized: this.initialized, flags: { ...S.flags }, stats: { ...S.stats },
        data: { dismissed: S.data.dismissed.size, keywords: S.data.keywords.length, companies: S.data.companies.length, canUndo: !!S.data.lastManual },
        services: { detect: !!S.int.detect, hide: !!S.int.hide, process: !!S.int.process, flush: !!S.int.flush },
        cleanup: { controllers: S.cleanup.controllers.size, observers: S.cleanup.observers.size, intervals: S.cleanup.intervals.size, timeouts: S.cleanup.timeouts.size }
      };
    }
  }

  // Event Handlers
  window.addEventListener('manualJobDismissed', e => {
    const { jobId, jobTitle, companyName } = e.detail;
    console.log(`RECEIVED manualJobDismissed event for: "${jobTitle}" from "${companyName}" (${jobId})`);

    UI.show(jobId, jobTitle, companyName);

    console.log(`Attempted to show undo popup for: "${jobTitle}" (${jobId})`);

    if (S.flags.hiding) {
      const wrap = U.queryOne([`${CFG.SEL.job}[data-job-id="${jobId}"]`, ...CFG.SEL.jobFb.map(s => `${s}[data-job-id="${jobId}"]`)]);
      if (wrap) {
        const item = wrap.closest(CFG.SEL.listItem) || wrap.parentElement;
        if (item && item.style.display !== 'none') {
          item.style.display = 'none';
          item.setAttribute('data-hidden', 'true');
          wrap.setAttribute('data-hidden', 'true');
          S.stats.hidden++;
          console.log(`Hidden job after manual dismissal: "${jobTitle}" (${jobId})`);
        }
      }
    }
  });

  window.addEventListener('jobStorageUpdated', () => Store.save());

  // Initialize
  const manager = new Manager();
  if (location.hostname.includes('linkedin.com')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => manager.init());
    else manager.init();
  }

  // Export
  window.LinkedInJobManager = {
    manager, state: S, utils: U, config: CFG, jobs: Jobs, ui: UI, store: Store, controls: Controls,
    getStatus: () => manager.getStatus(), restart: () => Controls.restart(), cleanup: () => Cleanup.all(),
    debug: {
      ...Jobs, showPopup: UI.show, hidePopups: UI.removeAll, showMsg: UI.showMessage,
      flush: Store.save, load: Store.loadSettings, clear: () => Msg.handle({ action: 'clearDismissedJobs' }, () => { }),
      getState: () => ({ ...S }), getConfig: () => CFG, measure: (name, fn) => { const start = performance.now(); const result = fn(); console.log(`${name}: ${(performance.now() - start).toFixed(2)}ms`); return result; }
    }
  };

})();