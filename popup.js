// Flash Video Downloader - Popup Script (v3.2.1)

document.addEventListener('DOMContentLoaded', async () => {
  const mediaListContainer = document.getElementById('media-list');
  const emptyState = document.getElementById('empty-state');
  const loadingState = document.getElementById('loading-state');
  const searchInput = document.getElementById('search-input');
  const countAll = document.getElementById('count-all');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnClear = document.getElementById('btn-clear');
  const tabButtons = document.querySelectorAll('.tab-btn');

  // Views & Settings
  const viewMain = document.getElementById('view-main');
  const viewSettings = document.getElementById('view-settings');
  const btnSettingsToggle = document.getElementById('btn-settings-toggle');
  const btnBackMain = document.getElementById('btn-back-main');
  const selectLanguage = document.getElementById('select-language');
  const chkAutoDelete = document.getElementById('chk-auto-delete');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const historyListContainer = document.getElementById('history-list');
  const chkAskEachTime = document.getElementById('chk-ask-each-time');
  const fixedLocationOptions = document.getElementById('fixed-location-options');
  const btnPickFolder = document.getElementById('btn-pick-folder');
  const txtSelectedFolder = document.getElementById('txt-selected-folder');

  let currentLang = 'en'; // Default English
  let allMedia = [];
  let currentFilter = 'all';
  let currentSearch = '';
  let activeTabId = null;
  let currentlyPlayingCard = null;
  let pollInterval = null;
  let pendingCancel = null; // { id, url }
  const confirmModal = document.getElementById('confirm-stop-modal');
  const appFooter = document.getElementById('app-footer');
  const txtConfirmTitle = document.getElementById('txt-confirm-title');
  const txtConfirmDesc = document.getElementById('txt-confirm-desc');
  const btnConfirmYes = document.getElementById('btn-confirm-yes');
  const btnConfirmNo = document.getElementById('btn-confirm-no');

  // Smooth 1-100 animation helpers
  const smoothPercents = new Map(); // downloadId -> last displayed percent
  const smoothTimers = new Map(); // downloadId -> interval id
  function animatePercentCounter(downloadId, targetPercent, onStep) {
    let current = smoothPercents.get(downloadId);
    if (current === undefined) {
      // start from 0 so first animation shows 0→target step-by-step
      current = 0;
      smoothPercents.set(downloadId, 0);
      if (targetPercent === 0) { onStep(0); return; }
    }
    if (current === targetPercent) {
      onStep(targetPercent);
      return;
    }
    if (smoothTimers.has(downloadId)) {
      clearInterval(smoothTimers.get(downloadId));
      smoothTimers.delete(downloadId);
    }
    const dir = targetPercent > current ? 1 : -1;
    const steps = Math.abs(targetPercent - current);
    const intervalMs = Math.max(18, Math.min(50, 320 / steps));
    const timer = setInterval(() => {
      current += dir;
      smoothPercents.set(downloadId, current);
      onStep(current);
      if (current === targetPercent) {
        clearInterval(timer);
        smoothTimers.delete(downloadId);
      }
    }, intervalMs);
    smoothTimers.set(downloadId, timer);
  }

  // Instant push update (no 500ms poll lag) - listen to OFFSCREEN_PROGRESS via background echo
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'OFFSCREEN_PROGRESS' && msg.state) {
      const dl = msg.state;
      // update card immediately if visible
      const card = document.querySelector(`.media-card[data-url="${CSS.escape(dl.url)}"]`);
      if (card) updateCardDownloadState(card, dl);
      // also trigger active list refresh throttled
      checkOngoingDownloads();
    }
  });

  // Hämta sparade inställningar (engelska + fråga varje gång tills användaren ändrar själv)
  const stored = await chrome.storage.local.get(['appLanguage', 'autoDelete24h', 'useDefaultDownloadFolder', 'useCustomDirectory', 'customDirectoryName']);
  currentLang = (stored.appLanguage && i18n[stored.appLanguage]) ? stored.appLanguage : 'en';
  selectLanguage.value = currentLang;
  chkAutoDelete.checked = stored.autoDelete24h !== false;
  const hasSavedFolder = stored.useDefaultDownloadFolder === true && stored.useCustomDirectory === true;
  chkAskEachTime.checked = !hasSavedFolder;
  updateSelectedFolderLabel(hasSavedFolder ? (stored.customDirectoryName || '') : '');

  function updateSelectedFolderLabel(name) {
    if (!txtSelectedFolder) return;
    txtSelectedFolder.textContent = name ? t('selectedFolder').replace('{name}', name) : t('noFolderSelected');
  }

  function updateFolderOptionsVisibility() {
    const askEachTime = chkAskEachTime.checked;
    fixedLocationOptions.classList.toggle('hidden', askEachTime);
  }
  updateFolderOptionsVisibility();

  function t(key) {
    if (i18n[currentLang] && i18n[currentLang][key]) {
      return i18n[currentLang][key];
    }
    return i18n['en'][key] || key;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Hjälpare för sortering: störst först
  function formatBytesPopup(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }
  function parseSizeToBytes(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string') return 0;
    const s = sizeStr.trim().toLowerCase();
    if (s === 'web source' || s === 'direct' || s === 'n/a' || s === '' || s === 'stream') return 0;
    const m = s.match(/([\d.,]+)\s*(bytes|kb|mb|gb|tb)?/);
    if (!m) return 0;
    const val = parseFloat(m[1].replace(',', '.'));
    if (isNaN(val)) return 0;
    const unit = (m[2] || 'bytes').toLowerCase();
    const mult = { bytes: 1, kb: 1024, mb: 1024*1024, gb: 1024*1024*1024, tb: 1024*1024*1024*1024 }[unit] || 1;
    return Math.round(val * mult);
  }
  function parseDurationToSec(durStr) {
    if (!durStr || typeof durStr !== 'string') return 0;
    const s = durStr.trim().toLowerCase();
    // format: "1h 2m 3s" eller "2m 30s" eller "1:23" eller "01:02:03"
    if (s.includes('h') || s.includes('m')) {
      let sec = 0;
      const h = s.match(/(\d+)\s*h/);
      const m = s.match(/(\d+)\s*m/);
      const secM = s.match(/(\d+)\s*s/);
      if (h) sec += parseInt(h[1],10)*3600;
      if (m) sec += parseInt(m[1],10)*60;
      if (secM) sec += parseInt(secM[1],10);
      return sec;
    }
    if (s.includes(':')) {
      const parts = s.split(':').map(p=>parseInt(p,10)||0);
      if (parts.length===3) return parts[0]*3600+parts[1]*60+parts[2];
      if (parts.length===2) return parts[0]*60+parts[1];
    }
    const num = parseInt(s,10);
    return isNaN(num)?0:num;
  }
  function getDisplaySize(item) {
    // Never show size for streaming manifests - playlist size (e.g. 6.5KB) is not video size
    const streamFmts = new Set(['M3U8','M3U','MPD','M4S','FMP4','TS','M2TS']);
    if (item.format && streamFmts.has(item.format.toUpperCase())) return '';
    // Validate: 21min video cannot be 6.5KB - hide implausible small sizes
    let raw = 0;
    if (item.rawSize && item.rawSize > 0) raw = item.rawSize;
    else if (item.size && !['Web source','Direct','N/A','Stream',''].includes(item.size)) raw = parseSizeToBytes(item.size);
    else if (item.totalBytes && item.totalBytes > 0) raw = item.totalBytes;
    if (raw > 0) {
      const durSec = parseDurationToSec(item.duration || '');
      // If video is >2min but claimed size <100KB -> false (manifest/segment), hide
      if (durSec > 120 && raw < 100 * 1024) return '';
      // If size <15KB generally unreliable for video
      if (raw < 15 * 1024) return '';
      if (item.rawSize && item.rawSize > 0) return formatBytesPopup(item.rawSize);
      if (item.size && !['Web source','Direct','N/A','Stream',''].includes(item.size)) return item.size;
      if (item.totalBytes && item.totalBytes > 0) return formatBytesPopup(item.totalBytes);
    }
    return '';
  }

  function updateVersionLabels() {
    const version = chrome.runtime.getManifest().version;
    const label = 'v' + version;
    const headerVersion = document.getElementById('txt-app-version');
    const footerVersion = document.getElementById('txt-footer-version');
    const settingsVersion = document.getElementById('txt-settings-version');
    if (headerVersion) headerVersion.textContent = label;
    if (footerVersion) footerVersion.textContent = label;
    if (settingsVersion) settingsVersion.textContent = label;
  }

  function applyLanguage() {
    document.getElementById('txt-app-title').textContent = t('title');
    updateVersionLabels();
    searchInput.placeholder = t('searchPlaceholder');
    document.getElementById('tab-all-text').textContent = t('all');
    document.getElementById('tab-video-text').textContent = t('video');
    document.getElementById('tab-stream-text').textContent = t('stream');
    document.getElementById('txt-empty-title').textContent = t('noVideosTitle');
    document.getElementById('txt-empty-desc').textContent = t('noVideosDesc');
    document.getElementById('txt-loading').textContent = t('loading');
    document.getElementById('txt-footer').textContent = t('footerText');
    document.getElementById('txt-lang-title').textContent = t('language');
    document.getElementById('txt-download-title').textContent = t('downloadLocation');
    document.getElementById('txt-ask-each-time').textContent = t('askEachTime');
    if (btnPickFolder) btnPickFolder.textContent = t('pickFolderBtn');
    chrome.storage.local.get(['customDirectoryName']).then(data => {
      updateSelectedFolderLabel(data.customDirectoryName || '');
    });
    document.getElementById('txt-history-title').textContent = t('downloadHistory');
    document.getElementById('txt-auto-delete').textContent = t('autoDelete24h');
    document.getElementById('txt-active-downloads').textContent = t('activeDownloads');
    btnClearHistory.textContent = t('clearHistory');
    btnBackMain.textContent = t('back');
    const txtSupportTitle = document.getElementById('txt-support-title');
    const txtSupportDesc = document.getElementById('txt-support-desc');
    const txtSupportBtn = document.getElementById('txt-support-btn');
    if (txtSupportTitle) txtSupportTitle.textContent = t('supportTitle');
    if (txtSupportDesc) txtSupportDesc.textContent = t('supportDesc');
    if (txtSupportBtn) txtSupportBtn.textContent = t('supportBtn');
    const txtCreditsCreated = document.getElementById('txt-credits-created');
    const btnCopyEmail = document.getElementById('btn-copy-email');
    if (txtCreditsCreated) txtCreditsCreated.textContent = t('creditsCreated');
    if (btnCopyEmail) btnCopyEmail.title = t('copyEmail');
    if (btnCopyEmail) btnCopyEmail.setAttribute('aria-label', t('copyEmail'));
    if (txtConfirmTitle) txtConfirmTitle.textContent = t('confirmStopTitle');
    if (txtConfirmDesc) txtConfirmDesc.textContent = t('confirmStopDesc');
    if (btnConfirmYes) btnConfirmYes.textContent = t('confirmYes');
    if (btnConfirmNo) btnConfirmNo.textContent = t('confirmNo');

    if (viewSettings.classList.contains('hidden')) {
      renderList();
    }
    renderHistory();
  }

  function openSettingsView() {
    viewMain.classList.add('hidden');
    viewSettings.classList.remove('hidden');
    btnSettingsToggle.classList.add('active');
    if (appFooter) appFooter.classList.add('hidden');
    renderHistory();
  }

  function openMainView() {
    viewSettings.classList.add('hidden');
    viewMain.classList.remove('hidden');
    btnSettingsToggle.classList.remove('active');
    if (appFooter) appFooter.classList.remove('hidden');
  }

  function openConfirmModal(downloadId, url) {
    pendingCancel = { id: downloadId, url: url || '' };
    if (txtConfirmTitle) txtConfirmTitle.textContent = t('confirmStopTitle');
    if (txtConfirmDesc) txtConfirmDesc.textContent = t('confirmStopDesc');
    confirmModal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    confirmModal.classList.add('hidden');
    pendingCancel = null;
  }
  if (btnConfirmNo) btnConfirmNo.addEventListener('click', closeConfirmModal);
  if (confirmModal) confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirmModal(); });

  const activeDownloadsList = document.getElementById('active-downloads-list');
  if (activeDownloadsList && !activeDownloadsList.dataset.controlsBound) {
    activeDownloadsList.dataset.controlsBound = '1';
    activeDownloadsList.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-adl-pause, .btn-adl-resume, .btn-adl-close');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.active-dl-card');
      if (!card || !card.dataset.dlId) return;
      try {
        if (btn.classList.contains('btn-adl-pause')) {
          await chrome.runtime.sendMessage({ type: 'PAUSE_DOWNLOAD', downloadId: card.dataset.dlId });
        } else if (btn.classList.contains('btn-adl-resume')) {
          await chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOAD', downloadId: card.dataset.dlId });
        } else if (btn.classList.contains('btn-adl-close')) {
          openConfirmModal(card.dataset.dlId, card.dataset.dlUrl || '');
        }
      } catch (err) {}
      setTimeout(checkOngoingDownloads, 80);
    });
  }

  if (mediaListContainer && !mediaListContainer.dataset.progressBound) {
    mediaListContainer.dataset.progressBound = '1';
    mediaListContainer.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-pause, .btn-resume, .btn-stop');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.media-card');
      if (!card || !card.dataset.dlId) return;
      try {
        if (btn.classList.contains('btn-pause')) {
          await chrome.runtime.sendMessage({ type: 'PAUSE_DOWNLOAD', downloadId: card.dataset.dlId });
        } else if (btn.classList.contains('btn-resume')) {
          await chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOAD', downloadId: card.dataset.dlId });
        } else if (btn.classList.contains('btn-stop')) {
          openConfirmModal(card.dataset.dlId, card.dataset.url || '');
        }
      } catch (err) {}
      setTimeout(checkOngoingDownloads, 80);
    });
  }

  function renderActiveDownloadControls(ctrlBox, dl) {
    const statusKey = (dl.status === 'downloading' || dl.status === 'paused') ? dl.status : 'idle';
    if (ctrlBox.dataset.dlStatus === statusKey && ctrlBox.childElementCount > 0) return;
    ctrlBox.dataset.dlStatus = statusKey;
    ctrlBox.innerHTML = '';
    if (dl.status === 'downloading') {
      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'btn-adl btn-adl-pause';
      pauseBtn.title = t('pause');
      pauseBtn.textContent = '⏸';
      ctrlBox.appendChild(pauseBtn);
    } else if (dl.status === 'paused') {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'btn-adl btn-adl-resume';
      resumeBtn.title = t('resume');
      resumeBtn.textContent = '▶';
      ctrlBox.appendChild(resumeBtn);
    }
    if (dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging') {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn-adl btn-adl-close';
      closeBtn.title = t('cancel');
      closeBtn.textContent = '✕';
      ctrlBox.appendChild(closeBtn);
    }
  }

  if (btnConfirmYes) btnConfirmYes.addEventListener('click', async () => {
    if (!pendingCancel) return;
    const { id, url } = pendingCancel;
    closeConfirmModal();
    try {
      const dlRes = await chrome.runtime.sendMessage({ type: 'GET_ALL_DOWNLOADS' });
      const dl = dlRes && dlRes.downloads ? dlRes.downloads.find(d => d.id === id) : null;
      const isActive = dl && (dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging');
      if (isActive) {
        await chrome.runtime.sendMessage({ type: 'CANCEL_DOWNLOAD', downloadId: id });
      } else {
        await chrome.runtime.sendMessage({ type: 'REMOVE_DOWNLOAD_ENTRY', downloadId: id });
      }
      // hide progress on matching card
      if (url) {
        const card = document.querySelector(`.media-card[data-url="${CSS.escape(url)}"]`);
        if (card) {
          const pb = card.querySelector('.progress-box');
          if (pb) pb.classList.add('hidden');
          const db = card.querySelector('.btn-download');
          if (db) { db.disabled = false; db.textContent = t('download'); }
        }
      }
      checkOngoingDownloads();
    } catch (e) {}
  });

  applyLanguage();

  let canLoadMedia = false;

  // Hämta aktiv flik
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showEmptyState(t('errorOccurred'));
  } else {
    activeTabId = tab.id;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
      showEmptyState(t('internalPageBlocked'));
    } else {
      try {
        const blockCheck = await chrome.runtime.sendMessage({ type: 'IS_URL_BLOCKED', url: tab.url });
        if (blockCheck && blockCheck.blocked) {
          showEmptyState(t('blockedSite'));
        } else {
          canLoadMedia = true;
        }
      } catch (e) {
        canLoadMedia = true;
      }
    }
  }

  async function ensureContentScript(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        files: ['blocked-hosts.js', 'content.js']
      });
    } catch (e) {
      console.warn('[FVD] Content script injection:', e);
    }
  }

  function getSafeVideoFilename(originalFilename, url, format, contentType) {
    // Alla tillåtna källor sparas som video (.mp4) för universell uppspelning, utom ren audio
    let name = (originalFilename || '').split('?')[0].split('#')[0].trim();
    name = name.replace(/[/\\?%*:|"<>]/g, '_');
    name = name.replace(/\.(php|aspx|asp|jsp|html|htm|bin|do|cgi|axd|mpd|m3u|m3u8|ts|m4s|fmp4|m2ts)$/i, '');

    const urlLower = (url || '').toLowerCase();
    const formatLower = (format || '').toLowerCase();
    const mimeLower = (contentType || '').toLowerCase();
    const isBlob = urlLower.startsWith('blob:');

    // Audio-only behålls som mp3, allt annat blir mp4-video
    const isAudioOnly = (formatLower === 'mp3' || formatLower === 'm4a' || formatLower === 'wav' || formatLower === 'ogg' || formatLower === 'opus' || formatLower === 'flac')
      || urlLower.includes('.mp3') || urlLower.endsWith('.m4a') || urlLower.endsWith('.wav')
      || (mimeLower.startsWith('audio/') && !mimeLower.startsWith('video/'));
    let targetExt = isAudioOnly ? 'mp3' : 'mp4';

    if (!name || name === 'videoplayback' || name.startsWith('video_') || name.startsWith('master') || name.startsWith('playlist') || name.startsWith('index') || name.startsWith('chunk') || name.startsWith('frag')) {
      name = `video_${Date.now().toString().slice(-4)}`;
    }

    // Ta bort manifest/segment-endelser så det blir .mp4
    if (/\.(ts|m3u8|m3u|mpd|m4s|fmp4|m2ts)$/i.test(name)) {
      name = name.replace(/\.[^.]+$/, '');
    }

    // blob: har ingen filända – ge alltid .mp4 (video)
    if (isBlob && !name.toLowerCase().endsWith('.mp4') && !isAudioOnly) {
      name = name.replace(/\.[^.]+$/, '') + '.mp4';
      if (!name.includes('.')) name += '.mp4';
    }

    const knownVideoExts = ['.mp4','.m4v','.webm','.flv','.f4v','.mov','.avi','.mkv','.ogv','.3gp','.3g2','.wmv','.av1','.hevc','.vob','.mpg','.mpeg'];
    const knownMedia = [...knownVideoExts, '.mp3', '.m4a', '.wav', '.ogg', '.opus', '.flac', '.aac', '.wma'];
    const hasValidExt = knownMedia.some(ext => name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      const lastDot = name.lastIndexOf('.');
      if (lastDot > 0 && name.length - lastDot <= 6) {
        name = name.substring(0, lastDot);
      }
      name = `${name}.${targetExt}`;
    } else {
      // Behåll original videoformat (.avi/.mkv/.mov etc) – konvertera bara streaming-manifest till .mp4
      if (/\.(m3u8|m3u|mpd|ts|m4s|fmp4|m2ts)$/i.test(name)) {
        name = name.replace(/\.[^.]+$/, '.mp4');
      }
    }

    return name;
  }

  function isSegmentLikeItem(item) {
    const u = (item.url || '').toLowerCase();
    return /\.(ts|m4s|fmp4|cmfv|cmfa)(\?|#|$)/i.test(u);
  }

  function itemByteSize(item) {
    if (typeof item.rawSize === 'number' && item.rawSize > 0) return item.rawSize;
    return parseSizeToBytes(item.size);
  }

  function pickBestMediaCandidates(items, maxCount) {
    const sorted = [...items].sort((a, b) => itemByteSize(b) - itemByteSize(a));
    const stream = sorted.find(i => /\.(m3u8|m3u|mpd)(\?|#|$)/i.test(i.url));
    const blob = sorted.find(i => (i.url || '').startsWith('blob:'));
    const file = sorted.find(i => /\.(mp4|webm|mov|mkv)(\?|#|$)/i.test(i.url));
    const picked = [];
    if (blob) picked.push(blob);
    else if (stream) picked.push(stream);
    else if (file) picked.push(file);
    else if (sorted[0]) picked.push(sorted[0]);
    for (const item of sorted) {
      if (picked.length >= maxCount) break;
      if (!picked.some(p => p.url === item.url)) picked.push(item);
    }
    return picked.slice(0, maxCount);
  }

  function filterToVisiblePageMedia(items, domResponse) {
    let filtered = items.filter(i => !isSegmentLikeItem(i));
    if (!domResponse) return pickBestMediaCandidates(filtered, 3);

    const visibleCount = domResponse.visibleVideoCount || 0;
    const visibleUrls = new Set(domResponse.visibleUrls || []);

    if (visibleCount === 0 && visibleUrls.size === 0) {
      return pickBestMediaCandidates(filtered, 3);
    }

    if (visibleUrls.size > 0) {
      const direct = filtered.filter(item => visibleUrls.has(item.url));
      if (direct.length > 0) {
        filtered = direct;
      }
    }

    if (visibleCount === 1) {
      const blobItem = filtered.find(i => (i.url || '').startsWith('blob:'));
      if (blobItem) return [blobItem];
      const stream = filtered.find(i => /\.(m3u8|m3u|mpd)(\?|#|$)/i.test(i.url));
      if (stream) return [stream];
      const files = filtered.filter(i => /\.(mp4|webm|mov|mkv)(\?|#|$)/i.test(i.url));
      if (files.length) return pickBestMediaCandidates(files, 1);
      return pickBestMediaCandidates(filtered, 1);
    }

    if (filtered.length > visibleCount * 2) {
      return pickBestMediaCandidates(filtered, visibleCount);
    }

    return filtered;
  }

  async function resolveActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return null;
      activeTabId = tab.id;
      return tab;
    } catch (e) {
      return null;
    }
  }

  async function isTabBlocked(tab) {
    if (!tab || !tab.url) return true;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
      return true;
    }
    try {
      const blockCheck = await chrome.runtime.sendMessage({ type: 'IS_URL_BLOCKED', url: tab.url });
      return !!(blockCheck && blockCheck.blocked);
    } catch (e) {
      return false;
    }
  }

  function mergeDomItems(items, domItems) {
    const byUrl = new Map(items.map(i => [i.url, i]));
    domItems.forEach(domItem => {
      const existing = byUrl.get(domItem.url);
      if (existing) {
        if (domItem.duration) existing.duration = domItem.duration;
        if (domItem.filename) existing.filename = domItem.filename;
        existing.fromVisibleDom = true;
      } else {
        const added = {
          url: domItem.url,
          filename: domItem.filename,
          format: domItem.format,
          duration: domItem.duration || '',
          size: 'Web source',
          rawSize: 0,
          discoveredAt: Date.now(),
          fromVisibleDom: true
        };
        items.push(added);
        byUrl.set(domItem.url, added);
      }
    });
    return items;
  }

  async function fetchMediaForTab({ refresh = false } = {}) {
    const tab = await resolveActiveTab();
    if (!tab || !tab.id) {
      loadingState.classList.add('hidden');
      showEmptyState(t('errorOccurred'));
      return;
    }

    if (await isTabBlocked(tab)) {
      loadingState.classList.add('hidden');
      const blockedMsg = (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://'))
        ? t('internalPageBlocked')
        : t('blockedSite');
      showEmptyState(blockedMsg);
      allMedia = [];
      countAll.textContent = '0';
      return;
    }

    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    mediaListContainer.innerHTML = '';
    stopCurrentPreview();

    if (refresh) {
      btnRefresh.disabled = true;
      btnRefresh.classList.add('spinning');
    }

    try {
      const msgType = refresh ? 'REFRESH_MEDIA' : 'GET_MEDIA';
      const bgResponse = await chrome.runtime.sendMessage({
        type: msgType,
        tabId: activeTabId
      });

      let items = (bgResponse && bgResponse.media) ? bgResponse.media : [];
      let domResponse = null;

      try {
        await ensureContentScript(activeTabId);
        domResponse = await chrome.tabs.sendMessage(activeTabId, { type: 'SCAN_PAGE' });
        if (domResponse && Array.isArray(domResponse.items)) {
          items = mergeDomItems(items, domResponse.items);
        }
      } catch (domErr) {
        console.warn('[FVD] DOM scan failed:', domErr);
      }

      items = filterToVisiblePageMedia(items, domResponse);
      allMedia = items;
      renderList();
      checkOngoingDownloads();
    } catch (err) {
      console.error('Error fetching media:', err);
      showEmptyState(t('errorOccurred'));
    } finally {
      loadingState.classList.add('hidden');
      if (refresh) {
        btnRefresh.disabled = false;
        btnRefresh.classList.remove('spinning');
      }
    }
  }

  // Ladda videor från nätverket och sidan
  async function loadMedia() {
    await fetchMediaForTab({ refresh: false });
  }

  function getBadgeClass(format) {
    switch (format.toUpperCase()) {
      case 'MP4': return 'badge-mp4';
      case 'WEBM': return 'badge-webm';
      case 'M3U8': return 'badge-m3u8';
      case 'FLV': return 'badge-flv';
      default: return 'badge-default';
    }
  }

  function stopCurrentPreview() {
    if (currentlyPlayingCard) {
      const prevContainer = currentlyPlayingCard.querySelector('.preview-container');
      const prevPlayBtn = currentlyPlayingCard.querySelector('.btn-play');
      if (prevContainer) {
        prevContainer.innerHTML = '';
        prevContainer.classList.add('hidden');
      }
      if (prevPlayBtn) {
        prevPlayBtn.textContent = t('play');
        prevPlayBtn.classList.remove('playing');
      }
      currentlyPlayingCard = null;
    }
  }

  async function checkOngoingDownloads() {
    const activeSection = document.getElementById('active-downloads-section');
    const activeList = document.getElementById('active-downloads-list');

    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_ALL_DOWNLOADS' });
      if (res && res.downloads) {
        // Update any matching media cards (same tab)
        res.downloads.forEach(dl => {
          const card = document.querySelector(`.media-card[data-url="${CSS.escape(dl.url)}"]`);
          if (card) {
            updateCardDownloadState(card, dl);
          }
        });

        // Render global Active Downloads banner (visible from ANY window)
        const activeDls = res.downloads.filter(dl => dl.status === 'downloading' || dl.status === 'merging' || dl.status === 'paused');
        const completedRecent = res.downloads.filter(dl => dl.status === 'completed' || dl.status === 'error');

        const showList = [...activeDls, ...completedRecent];

        if (showList.length === 0) {
          activeSection.classList.add('hidden');
          activeList.innerHTML = '';
          return;
        }

        activeSection.classList.remove('hidden');
        document.getElementById('txt-active-downloads').textContent = t('activeDownloads');

        // Update or create cards for each active download
        showList.forEach(dl => {
          const cardId = `adl-${CSS.escape(dl.id)}`;
          let card = activeList.querySelector(`#${cardId}`);

          if (!card) {
            card = document.createElement('div');
            card.className = 'active-dl-card';
            card.id = cardId;
            card.innerHTML = `
              <div class="adl-top-row"><div class="adl-title"></div><div class="adl-controls"></div></div>
              <div class="adl-progress-bar-bg"><div class="adl-progress-bar-fill"></div></div>
              <div class="adl-info"><span class="adl-percent"></span><span class="adl-segments"></span></div>
              <div class="adl-duration"></div>
            `;
            activeList.appendChild(card);
          }

          card.querySelector('.adl-title').textContent = dl.filename || 'Video';
          card.dataset.dlId = dl.id;
          card.dataset.dlUrl = dl.url || '';
          const adlBar = card.querySelector('.adl-progress-bar-fill');
          const adlPercentEl = card.querySelector('.adl-percent');
          const adlSegEl = card.querySelector('.adl-segments');
          const adlDurEl = card.querySelector('.adl-duration');
          adlBar.style.width = `${dl.percent || 0}%`;

          const ctrlBox = card.querySelector('.adl-controls');
          renderActiveDownloadControls(ctrlBox, dl);

          if (dl.status === 'downloading') {
            let durationStr = '';
            if (dl.totalDurationFormatted) {
              durationStr = `${dl.downloadedDurationFormatted || '0s'} / ${dl.totalDurationFormatted}`;
            }
            const sz = dl.totalBytes ? formatBytesPopup(dl.totalBytes) : '';
            adlSegEl.textContent = `${dl.completed || 0}/${dl.total || '?'}`;
            adlDurEl.textContent = sz ? `📦 ${sz} • ${durationStr}` : durationStr;
            animatePercentCounter(dl.id, dl.percent || 0, (cur) => {
              adlPercentEl.textContent = `${t('downloading')} ${cur}%`;
            });
          } else if (dl.status === 'paused') {
            let durationStr = '';
            if (dl.totalDurationFormatted) {
              durationStr = `${dl.downloadedDurationFormatted || '0s'} / ${dl.totalDurationFormatted}`;
            }
            const sz = dl.totalBytes ? formatBytesPopup(dl.totalBytes) : '';
            adlSegEl.textContent = `${dl.completed || 0}/${dl.total || '?'}`;
            adlDurEl.textContent = sz ? `📦 ${sz} • ${durationStr}` : durationStr;
            animatePercentCounter(dl.id, dl.percent || 0, (cur) => {
              adlPercentEl.textContent = `${t('paused')} ${cur}%`;
            });
          } else if (dl.status === 'merging') {
            adlPercentEl.textContent = t('saving');
            adlSegEl.textContent = '100%';
            adlDurEl.textContent = t('mergingVideo');
            adlBar.style.width = '100%';
          } else if (dl.status === 'completed') {
            adlPercentEl.textContent = t('downloaded');
            adlSegEl.textContent = '✅';
            adlDurEl.textContent = dl.totalDurationFormatted || t('savedToComputer');
            adlBar.style.width = '100%';
          } else if (dl.status === 'error') {
            adlPercentEl.textContent = t('errorOccurred');
            adlSegEl.textContent = '❌';
            adlDurEl.textContent = dl.error || '';
          }
        });

        // Remove cards for downloads that are no longer active
        const activeIds = new Set(showList.map(dl => `adl-${CSS.escape(dl.id)}`));
        activeList.querySelectorAll('.active-dl-card').forEach(card => {
          if (!activeIds.has(card.id)) {
            card.remove();
          }
        });
      }
    } catch (e) {}
  }

  function updateCardDownloadState(card, dlState) {
    const progressBox = card.querySelector('.progress-box');
    const progressBarFill = card.querySelector('.progress-bar-fill');
    const progressHeader = card.querySelector('.progress-header');
    const progressInfo = card.querySelector('.progress-info');
    const downloadBtn = card.querySelector('.btn-download');

    if (!progressBox) return;

    function ensureCardControls(dl) {
      let ctr = progressBox.querySelector('.progress-controls');
      if (!ctr) {
        ctr = document.createElement('div');
        ctr.className = 'progress-controls';
        progressBox.appendChild(ctr);
      }
      const statusKey = dl.status || 'idle';
      if (ctr.dataset.dlStatus === statusKey && ctr.childElementCount > 0) return;
      ctr.dataset.dlStatus = statusKey;
      const showPause = dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging';
      ctr.innerHTML = '';
      if (showPause) {
        if (dl.status === 'paused') {
          const b = document.createElement('button');
          b.className = 'btn-progress btn-resume';
          b.textContent = t('resume');
          ctr.appendChild(b);
        } else if (dl.status === 'downloading') {
          const b = document.createElement('button');
          b.className = 'btn-progress btn-pause';
          b.textContent = t('pause');
          ctr.appendChild(b);
        } else if (dl.status === 'merging') {
          const s = document.createElement('span');
          s.style.cssText = 'font-size:0.7rem;color:#93c5fd;';
          s.textContent = t('saving');
          ctr.appendChild(s);
        }
      }
      const spacer = document.createElement('span');
      spacer.className = 'spacer';
      ctr.appendChild(spacer);
      if (showPause || dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging') {
        const x = document.createElement('button');
        x.className = 'btn-progress btn-stop';
        x.title = t('cancel');
        x.textContent = '✕';
        ctr.appendChild(x);
      }
    }

    if (dlState.id) card.dataset.dlId = dlState.id;

    if (dlState.status === 'downloading') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = true;
      downloadBtn.textContent = t('downloading');
      progressBarFill.style.width = `${dlState.percent}%`;
      ensureCardControls(dlState);
      const headerLeft = progressHeader.querySelector('span:first-child');
      const headerRight = progressHeader.querySelector('span:last-child');
      // init header if not yet animated
      if (!progressHeader.dataset.animated) {
        progressHeader.innerHTML = `<span></span><span>${dlState.completed}/${dlState.total}</span>`;
        progressHeader.dataset.animated = '1';
      } else {
        progressHeader.querySelector('span:last-child').textContent = `${dlState.completed}/${dlState.total}`;
      }
      animatePercentCounter(dlState.id + '_card', dlState.percent, (cur) => {
        let durationStr = '';
        if (dlState.totalDurationFormatted) {
          const loadedDur = dlState.downloadedDurationFormatted || '0s';
          durationStr = ` | ${loadedDur} / ${dlState.totalDurationFormatted}`;
        }
        const left = progressHeader.querySelector('span:first-child');
        if (left) left.textContent = `${t('downloadedOf')}: ${cur}%${durationStr}`;
        const sz = dlState.totalBytes ? formatBytesPopup(dlState.totalBytes) : (dlState.size || '');
        const szPart = sz && sz !== 'Web source' ? `📦 ${sz} • ` : '';
        progressInfo.textContent = `${szPart}${t('duration')}: ${dlState.totalDurationFormatted || t('unknownDuration')} (${cur}%)`;
        progressBarFill.style.width = `${cur}%`;
      });
    } else if (dlState.status === 'paused') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = true;
      downloadBtn.textContent = t('paused');
      progressBarFill.style.width = `${dlState.percent}%`;
      ensureCardControls(dlState);
      if (!progressHeader.dataset.animated) {
        progressHeader.innerHTML = `<span></span><span>${dlState.completed}/${dlState.total}</span>`;
        progressHeader.dataset.animated = '1';
      } else {
        progressHeader.querySelector('span:last-child').textContent = `${dlState.completed}/${dlState.total}`;
      }
      animatePercentCounter(dlState.id + '_card', dlState.percent, (cur) => {
        let durationStr = '';
        if (dlState.totalDurationFormatted) {
          const loadedDur = dlState.downloadedDurationFormatted || '0s';
          durationStr = ` | ${loadedDur} / ${dlState.totalDurationFormatted}`;
        }
        const left = progressHeader.querySelector('span:first-child');
        if (left) left.textContent = `${t('paused')}: ${cur}%${durationStr}`;
        const sz = dlState.totalBytes ? formatBytesPopup(dlState.totalBytes) : (dlState.size || '');
        const szPart = sz && sz !== 'Web source' ? `📦 ${sz} • ` : '';
        progressInfo.textContent = `${szPart}${t('paused')} - ${cur}%`;
        progressBarFill.style.width = `${cur}%`;
      });
    } else if (dlState.status === 'merging') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = true;
      downloadBtn.textContent = t('saving');
      progressBarFill.style.width = `100%`;
      progressHeader.innerHTML = `<span>${t('saving')}</span><span>100%</span>`;
      progressInfo.textContent = t('mergingVideo');
      ensureCardControls(dlState);
    } else if (dlState.status === 'completed') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = false;
      downloadBtn.textContent = t('downloaded');
      progressBarFill.style.width = `100%`;
      progressHeader.innerHTML = `<span>${t('downloaded')}</span><span>100%</span>`;
      progressInfo.textContent = t('savedToComputer');
      // allow closing completed entry
      ensureCardControls({ ...dlState, status: 'completed' });
    } else if (dlState.status === 'error') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = false;
      downloadBtn.textContent = t('tryAgain');
      progressHeader.innerHTML = `<span style="color:#ef4444;">${t('errorOccurred')}</span>`;
      progressInfo.textContent = dlState.error || t('errorOccurred');
      ensureCardControls(dlState);
    }
  }

  function renderList() {
    mediaListContainer.innerHTML = '';
    stopCurrentPreview();

    let filtered = allMedia.filter(item => {
      const STREAM_SET = new Set(['M3U8','M3U','MPD','TS','M2TS','M4S','FMP4']);
      if (currentFilter === 'video' && STREAM_SET.has(item.format)) return false;
      if (currentFilter === 'stream' && !STREAM_SET.has(item.format)) return false;

      if (currentSearch) {
        const matchTitle = item.filename.toLowerCase().includes(currentSearch);
        const matchUrl = item.url.toLowerCase().includes(currentSearch);
        return matchTitle || matchUrl;
      }
      return true;
    });

    countAll.textContent = allMedia.length;

    if (filtered.length === 0) {
      showEmptyState();
      return;
    }

    // Störst fil först – fallande sort på faktisk storlek
    filtered.sort((a, b) => {
      const sizeA = (typeof a.rawSize === 'number' && a.rawSize > 0) ? a.rawSize : parseSizeToBytes(a.size);
      const sizeB = (typeof b.rawSize === 'number' && b.rawSize > 0) ? b.rawSize : parseSizeToBytes(b.size);
      // HLS/streams utan bytes hamnar efter direkta filer, men sortera dem på duration om det finns
      if (sizeA !== sizeB) return sizeB - sizeA;
      const durA = parseDurationToSec(a.duration);
      const durB = parseDurationToSec(b.duration);
      if (durA !== durB) return durB - durA;
      return (b.discoveredAt || 0) - (a.discoveredAt || 0);
    });

    emptyState.classList.add('hidden');

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.dataset.url = item.url;

      const safeDownloadName = getSafeVideoFilename(item.filename, item.url, item.format, item.contentType);
      const urlLower = item.url.toLowerCase();
      const isDash = item.format === 'MPD' || urlLower.includes('.mpd');
      const isHls = !isDash && (item.format === 'M3U8' || item.format === 'M3U' || urlLower.includes('.m3u8') || urlLower.includes('.m3u'));
      const isStream = isHls || isDash || ['TS','M4S','FMP4','M2TS'].includes(item.format);
      const displayFormat = isDash ? 'MPD' : (isHls ? 'M3U8' : (item.format || 'MP4'));
      const badgeClass = isHls ? 'badge-m3u8' : isStream ? 'badge-m3u8' : getBadgeClass(item.format);

      const durationHtml = item.duration ? `<span class="media-duration-tag">⏱️ ${item.duration}</span>` : '';
      const sizeStr = getDisplaySize(item);
      const sizeHtml = sizeStr ? `<span class="media-size-tag">📦 ${sizeStr}</span>` : '';
      // Card-bottom visar nu både storlek och tid – t.ex. "📦 45.2 MB • ⏱️ 2:34"
      let bottomInfo = '';
      if (sizeStr && item.duration) bottomInfo = `📦 ${sizeStr} • ⏱️ ${item.duration}`;
      else if (sizeStr) bottomInfo = `📦 ${sizeStr}`;
      else if (item.duration) bottomInfo = `⏱️ ${item.duration}`;
      else if (isHls) bottomInfo = t('fullStream');
      else bottomInfo = t('readyToDownload');
      // Progress-info visar också storlek om känd
      const safeUrl = escapeHtml(item.url);
      const safeTitle = escapeHtml(safeDownloadName);
      const progressInfoText = sizeStr ? `${t('size')}: ${sizeStr} • ${t('duration')}: ${item.duration || t('unknownDuration')}` : `${t('duration')}: ${item.duration || t('unknownDuration')}`;

      card.innerHTML = `
        <div class="card-top">
          <div class="title-container">
            <span class="media-title" title="${safeTitle}">${safeTitle}</span>
            <div class="media-meta-row">
              ${durationHtml}
              ${sizeHtml}
              <span class="media-url" title="${safeUrl}">${safeUrl}</span>
            </div>
          </div>
          <span class="badge ${badgeClass}">${displayFormat}</span>
        </div>

        <!-- Preview Player -->
        <div class="preview-container hidden"></div>

        <!-- Download Progress Bar -->
        <div class="progress-box hidden">
          <div class="progress-header">
            <span>${t('downloading')}</span>
            <span>0%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill"></div>
          </div>
          <div class="progress-info">${progressInfoText}</div>
        </div>

        <div class="card-bottom">
          <span class="media-size" title="${bottomInfo}">${bottomInfo}</span>
          <div class="card-actions">
            <button class="btn-action btn-play" title="Preview">${t('play')}</button>
            <button class="btn-action btn-copy" data-url="${item.url}" title="Copy URL">${t('copy')}</button>
            <button class="btn-action btn-download" title="Download">${t('download')}</button>
          </div>
        </div>
      `;

      const playBtn = card.querySelector('.btn-play');
      const previewContainer = card.querySelector('.preview-container');

      playBtn.addEventListener('click', () => {
        const isCurrentlyThisCard = (currentlyPlayingCard === card);
        stopCurrentPreview();

        if (isCurrentlyThisCard) return;

        const previewUrl = escapeHtml(item.url);
        previewContainer.classList.remove('hidden');
        previewContainer.innerHTML = `
          <div class="preview-wrapper" style="position: relative; width: 100%;">
            <video class="preview-video" controls autoplay playsinline preload="auto" tabindex="0">
              <source src="${previewUrl}">
              ${t('formatNotSupportedPreview')}
            </video>
            <div class="preview-osd hidden"></div>
          </div>
        `;

        const videoEl = previewContainer.querySelector('video');
        const osdEl = previewContainer.querySelector('.preview-osd');
        let seekState = { delta: 0, timer: null, baseTime: 0 };

        function showPreviewOsd(icon, text, subtext) {
          if (!osdEl) return;
          osdEl.innerHTML = `<span>${icon} ${text}</span>${subtext ? `<small>${subtext}</small>` : ''}`;
          osdEl.classList.remove('hidden');
          osdEl.style.opacity = '1';
          if (osdEl._timer) clearTimeout(osdEl._timer);
          osdEl._timer = setTimeout(() => {
            osdEl.style.opacity = '0';
            setTimeout(() => osdEl.classList.add('hidden'), 200);
          }, 700);
        }

        function smoothSeekPreview(deltaSec) {
          if (!videoEl || !isFinite(videoEl.duration)) {
            try { videoEl.currentTime += deltaSec; } catch(e) {}
            return;
          }

          if (seekState.timer) {
            clearTimeout(seekState.timer);
            seekState.delta += deltaSec;
          } else {
            seekState.delta = deltaSec;
            seekState.baseTime = videoEl.currentTime;
          }

          const target = Math.max(0, Math.min(videoEl.duration, seekState.baseTime + seekState.delta));
          const isFwd = seekState.delta > 0;
          showPreviewOsd(isFwd ? '⏩' : '⏪', `${isFwd ? '+' : ''}${Math.round(seekState.delta)}s`, `${Math.floor(target/60)}:${Math.floor(target%60).toString().padStart(2,'0')}`);

          seekState.timer = setTimeout(() => {
            seekState.timer = null;
            const finalTime = Math.max(0, Math.min(videoEl.duration, seekState.baseTime + seekState.delta));
            seekState.delta = 0;
            if (typeof videoEl.fastSeek === 'function') {
              try { videoEl.fastSeek(finalTime); return; } catch(e) {}
            }
            try { videoEl.currentTime = finalTime; } catch(e) {}
          }, 75);
        }

        videoEl.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 10 : (e.ctrlKey ? 30 : 5);
            smoothSeekPreview(e.key === 'ArrowLeft' ? -step : step);
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const newVol = e.key === 'ArrowUp' ? Math.min(1, videoEl.volume + 0.05) : Math.max(0, videoEl.volume - 0.05);
            videoEl.volume = newVol;
            showPreviewOsd(newVol > 0 ? '🔊' : '🔇', `${Math.round(newVol * 100)}%`);
          } else if (e.key === ' ') {
            e.preventDefault();
            if (videoEl.paused) videoEl.play(); else videoEl.pause();
          }
        });

        videoEl.onerror = () => {
          previewContainer.innerHTML = `
            <div class="preview-error">
              ${t('formatNotSupportedPreview')}
            </div>
          `;
        };

        playBtn.textContent = t('stop');
        playBtn.classList.add('playing');
        currentlyPlayingCard = card;
        setTimeout(() => videoEl.focus(), 100);
      });

      const copyBtn = card.querySelector('.btn-copy');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(item.url);
          const originalText = copyBtn.textContent;
          copyBtn.textContent = t('copied');
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1500);
        } catch (e) {}
      });

      const downloadBtn = card.querySelector('.btn-download');
      downloadBtn.addEventListener('click', () => {
        const urlLowerDl = item.url.toLowerCase();
        const isDashOnly = item.format === 'MPD' || urlLowerDl.includes('.mpd');
        if (isDashOnly) {
          const progressBox = card.querySelector('.progress-box');
          progressBox.classList.remove('hidden');
          downloadBtn.textContent = t('download');
          const progressHeader = card.querySelector('.progress-header');
          const progressInfo = card.querySelector('.progress-info');
          progressHeader.innerHTML = `<span style="color:#f59e0b;">MPD / DASH</span><span>—</span>`;
          progressInfo.textContent = t('dashNotSupported');
          return;
        }

        const downloadId = btoa(item.url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
        const progressBox = card.querySelector('.progress-box');
        progressBox.classList.remove('hidden');
        downloadBtn.disabled = true;
        downloadBtn.textContent = t('downloading');

        if (isHls) {
          chrome.runtime.sendMessage({
            type: 'START_HLS_DOWNLOAD',
            downloadId: downloadId,
            url: item.url,
            filename: safeDownloadName
          });
        } else if (item.url.startsWith('blob:')) {
          chrome.runtime.sendMessage({
            type: 'START_BLOB_DOWNLOAD',
            downloadId: downloadId,
            tabId: activeTabId,
            url: item.url,
            filename: safeDownloadName
          });
        } else {
          // Direktfil / blob: – även dessa sparas som video via generisk pipeline (progress + paus)
          chrome.runtime.sendMessage({
            type: 'START_GENERIC_DOWNLOAD',
            downloadId: downloadId,
            url: item.url,
            filename: safeDownloadName
          });
        }

        if (!pollInterval) {
          pollInterval = setInterval(checkOngoingDownloads, 120);
        }
      });

      mediaListContainer.appendChild(card);
    });
  }

  // Render download history in settings
  async function renderHistory() {
    const data = await chrome.storage.local.get(['downloadHistory', 'autoDelete24h']);
    let history = data.downloadHistory || [];
    const autoDelete = data.autoDelete24h !== false;

    if (autoDelete) {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      history = history.filter(h => h.timestamp > oneDayAgo);
    }

    historyListContainer.innerHTML = '';

    if (history.length === 0) {
      historyListContainer.innerHTML = `<div style="text-align:center; padding:15px; color:#64748b; font-size:0.75rem;">${t('noHistory')}</div>`;
      return;
    }

    history.forEach(h => {
      const dateStr = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(h.timestamp).toLocaleDateString();
      const div = document.createElement('div');
      div.className = 'history-item';
      const safeName = escapeHtml(h.filename);
      const safeSize = escapeHtml(h.size);
      const safeDur = h.duration && h.duration !== 'N/A' ? escapeHtml(h.duration) : '';
      div.innerHTML = `
        <div class="history-title" title="${safeName}">${safeName}</div>
        <div class="history-meta">
          <span>${safeSize}${safeDur ? ` • ⏱️ ${safeDur}` : ''}</span>
          <span>${dateStr}</span>
        </div>
      `;
      historyListContainer.appendChild(div);
    });
  }

  function showEmptyState(customMessage) {
    mediaListContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    loadingState.classList.add('hidden');
    if (customMessage) {
      emptyState.querySelector('h3').textContent = customMessage;
      emptyState.querySelector('p').textContent = t('noVideosDesc');
    } else {
      emptyState.querySelector('h3').textContent = t('noVideosTitle');
      emptyState.querySelector('p').textContent = t('noVideosDesc');
    }
  }

  // Event Listeners
  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase().trim();
    renderList();
  });

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderList();
    });
  });

  btnRefresh.addEventListener('click', async () => {
    if (viewMain.classList.contains('hidden')) {
      openMainView();
    }
    await fetchMediaForTab({ refresh: true });
  });

  btnClear.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'CLEAR_MEDIA',
      tabId: activeTabId
    });
    allMedia = [];
    renderList();
  });

  // Settings view toggle
  btnSettingsToggle.addEventListener('click', () => {
    openSettingsView();
  });

  btnBackMain.addEventListener('click', () => {
    openMainView();
  });

  const btnCopyEmail = document.getElementById('btn-copy-email');
  const CREDITS_EMAIL = 'bynrnworld@gmail.com';
  if (btnCopyEmail) {
    btnCopyEmail.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(CREDITS_EMAIL);
        btnCopyEmail.classList.add('copied');
        btnCopyEmail.title = t('emailCopied');
        setTimeout(() => {
          btnCopyEmail.classList.remove('copied');
          btnCopyEmail.title = t('copyEmail');
          btnCopyEmail.setAttribute('aria-label', t('copyEmail'));
        }, 1600);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = CREDITS_EMAIL;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          btnCopyEmail.classList.add('copied');
        } catch (err) {}
        document.body.removeChild(ta);
      }
    });
  }

  // Language switch
  selectLanguage.addEventListener('change', async (e) => {
    currentLang = e.target.value;
    await chrome.storage.local.set({ appLanguage: currentLang });
    applyLanguage();
  });

  // Auto-delete toggle
  chkAutoDelete.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ autoDelete24h: e.target.checked });
    if (e.target.checked) {
      try {
        await chrome.runtime.sendMessage({ type: 'PURGE_HISTORY' });
      } catch (err) {}
    }
    renderHistory();
  });

  chkAskEachTime.addEventListener('change', async (e) => {
    const askEachTime = e.target.checked;
    if (askEachTime) {
      await chrome.storage.local.set({
        useDefaultDownloadFolder: false,
        useCustomDirectory: false,
        customDirectoryName: ''
      });
      updateSelectedFolderLabel('');
    }
    updateFolderOptionsVisibility();
  });

  if (btnPickFolder) {
    btnPickFolder.addEventListener('click', async () => {
      if (typeof window.showDirectoryPicker !== 'function') {
        alert(t('folderPickerUnsupported'));
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await fvdSaveDirectoryHandle(handle);
        await chrome.storage.local.set({
          useDefaultDownloadFolder: true,
          useCustomDirectory: true,
          customDirectoryName: handle.name
        });
        chkAskEachTime.checked = false;
        updateFolderOptionsVisibility();
        updateSelectedFolderLabel(handle.name);
      } catch (err) {
        if (err && err.name === 'AbortError') {
          const data = await chrome.storage.local.get(['useCustomDirectory']);
          if (data.useCustomDirectory !== true) {
            chkAskEachTime.checked = true;
            updateFolderOptionsVisibility();
          }
        } else {
          console.warn('[FVD] Folder picker:', err);
        }
      }
    });
  }

  // Clear history
  btnClearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ downloadHistory: [] });
    renderHistory();
  });

  pollInterval = setInterval(checkOngoingDownloads, 120);

  if (canLoadMedia) {
    loadMedia();
  } else {
    loadingState.classList.add('hidden');
  }
});
