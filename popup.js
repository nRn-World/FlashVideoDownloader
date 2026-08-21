// Flash Video Downloader - Popup Script (v3.0 PRO) with Duration Tracking, i18n & History Settings

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

  let currentLang = 'en'; // Default English
  let allMedia = [];
  let currentFilter = 'all';
  let currentSearch = '';
  let activeTabId = null;
  let currentlyPlayingCard = null;
  let pollInterval = null;

  // Hämta sparade inställningar
  const stored = await chrome.storage.local.get(['appLanguage', 'autoDelete24h']);
  if (stored.appLanguage && i18n[stored.appLanguage]) {
    currentLang = stored.appLanguage;
  }
  selectLanguage.value = currentLang;
  chkAutoDelete.checked = stored.autoDelete24h !== false;

  function t(key) {
    if (i18n[currentLang] && i18n[currentLang][key]) {
      return i18n[currentLang][key];
    }
    return i18n['en'][key] || key;
  }

  function applyLanguage() {
    document.getElementById('txt-app-title').textContent = t('title');
    document.getElementById('txt-app-version').textContent = t('version');
    searchInput.placeholder = t('searchPlaceholder');
    document.getElementById('tab-all-text').textContent = t('all');
    document.getElementById('tab-video-text').textContent = t('video');
    document.getElementById('tab-stream-text').textContent = t('stream');
    document.getElementById('txt-empty-title').textContent = t('noVideosTitle');
    document.getElementById('txt-empty-desc').textContent = t('noVideosDesc');
    document.getElementById('txt-loading').textContent = t('loading');
    document.getElementById('txt-footer').textContent = t('footerText');
    document.getElementById('txt-lang-title').textContent = t('language');
    document.getElementById('txt-history-title').textContent = t('downloadHistory');
    document.getElementById('txt-auto-delete').textContent = t('autoDelete24h');
    btnClearHistory.textContent = t('clearHistory');
    btnBackMain.textContent = t('back');

    renderList();
    renderHistory();
  }

  applyLanguage();

  // Hämta aktiv flik
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showEmptyState('Could not identify active tab.');
    return;
  }
  activeTabId = tab.id;

  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
    showEmptyState('Extensions cannot run on internal browser pages. Open a regular website!');
    return;
  }

  function getSafeVideoFilename(originalFilename, url, format, contentType) {
    let name = (originalFilename || '').split('?')[0].split('#')[0].trim();
    name = name.replace(/[/\\?%*:|"<>]/g, '_');
    name = name.replace(/\.(php|aspx|asp|jsp|html|htm|bin|do|cgi|axd)$/i, '');

    const urlLower = (url || '').toLowerCase();
    const formatLower = (format || '').toLowerCase();
    const mimeLower = (contentType || '').toLowerCase();

    let targetExt = 'mp4';
    if (formatLower === 'webm' || urlLower.includes('.webm') || mimeLower.includes('webm')) {
      targetExt = 'webm';
    } else if (formatLower === 'flv' || urlLower.includes('.flv') || mimeLower.includes('flv')) {
      targetExt = 'flv';
    } else if (formatLower === 'mkv' || urlLower.includes('.mkv')) {
      targetExt = 'mkv';
    } else if (formatLower === 'mov' || urlLower.includes('.mov')) {
      targetExt = 'mov';
    } else if (formatLower === 'mp3' || urlLower.includes('.mp3') || mimeLower.includes('audio')) {
      targetExt = 'mp3';
    } else {
      targetExt = 'mp4';
    }

    if (!name || name === 'videoplayback' || name.startsWith('video_') || name.startsWith('master') || name.startsWith('playlist') || name.startsWith('index')) {
      name = `video_${Date.now().toString().slice(-4)}`;
    }

    if (name.toLowerCase().endsWith('.ts') || name.toLowerCase().endsWith('.m3u8')) {
      name = name.substring(0, name.lastIndexOf('.'));
    }

    const knownMedia = ['.mp4', '.webm', '.flv', '.mkv', '.mov', '.avi', '.mp3', '.m4a', '.wav'];
    const hasValidExt = knownMedia.some(ext => name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      const lastDot = name.lastIndexOf('.');
      if (lastDot > 0 && name.length - lastDot <= 5) {
        name = name.substring(0, lastDot);
      }
      name = `${name}.${targetExt}`;
    }

    return name;
  }

  // Ladda videor från nätverket och sidan
  async function loadMedia() {
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    mediaListContainer.innerHTML = '';

    try {
      const bgResponse = await chrome.runtime.sendMessage({
        type: 'GET_MEDIA',
        tabId: activeTabId
      });

      let items = (bgResponse && bgResponse.media) ? bgResponse.media : [];

      try {
        const domResponse = await chrome.tabs.sendMessage(activeTabId, { type: 'SCAN_PAGE' });
        if (domResponse && Array.isArray(domResponse.items)) {
          const existingUrls = new Set(items.map(i => i.url));
          domResponse.items.forEach(domItem => {
            if (!existingUrls.has(domItem.url)) {
              items.push({
                url: domItem.url,
                filename: domItem.filename,
                format: domItem.format,
                duration: domItem.duration || '',
                size: 'Web source',
                rawSize: 0,
                discoveredAt: Date.now()
              });
              existingUrls.add(domItem.url);
            }
          });
        }
      } catch (domErr) {}

      allMedia = items;
      renderList();
      checkOngoingDownloads();
    } catch (err) {
      console.error('Error fetching media:', err);
      showEmptyState(t('errorOccurred'));
    } finally {
      loadingState.classList.add('hidden');
    }
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
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_ALL_DOWNLOADS' });
      if (res && res.downloads) {
        res.downloads.forEach(dl => {
          const card = document.querySelector(`.media-card[data-url="${CSS.escape(dl.url)}"]`);
          if (card) {
            updateCardDownloadState(card, dl);
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

    if (dlState.status === 'downloading') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = true;
      downloadBtn.textContent = t('downloading');
      progressBarFill.style.width = `${dlState.percent}%`;

      // Visa nedladdad längd / total längd
      let durationStr = '';
      if (dlState.totalDurationFormatted) {
        const loadedDur = dlState.downloadedDurationFormatted || '0s';
        durationStr = ` | ${loadedDur} / ${dlState.totalDurationFormatted}`;
      }

      progressHeader.innerHTML = `<span>${t('downloadedOf')}: ${dlState.percent}%${durationStr}</span><span>${dlState.completed}/${dlState.total}</span>`;
      progressInfo.textContent = `${t('duration')}: ${dlState.totalDurationFormatted || t('unknownDuration')} (${dlState.percent}%)`;
    } else if (dlState.status === 'merging') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = true;
      downloadBtn.textContent = t('saving');
      progressBarFill.style.width = `100%`;
      progressHeader.innerHTML = `<span>${t('saving')}</span><span>100%</span>`;
      progressInfo.textContent = t('mergingVideo');
    } else if (dlState.status === 'completed') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = false;
      downloadBtn.textContent = t('downloaded');
      progressBarFill.style.width = `100%`;
      progressHeader.innerHTML = `<span>${t('downloaded')}</span><span>100%</span>`;
      progressInfo.textContent = t('savedToComputer');
    } else if (dlState.status === 'error') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = false;
      downloadBtn.textContent = t('tryAgain');
      progressHeader.innerHTML = `<span style="color:#ef4444;">${t('errorOccurred')}</span>`;
      progressInfo.textContent = dlState.error || t('errorOccurred');
    }
  }

  function renderList() {
    mediaListContainer.innerHTML = '';
    stopCurrentPreview();

    let filtered = allMedia.filter(item => {
      if (currentFilter === 'video' && !['MP4', 'WEBM', 'FLV', 'MKV', 'MOV', 'AVI'].includes(item.format)) {
        return false;
      }
      if (currentFilter === 'stream' && !['M3U8', 'TS'].includes(item.format)) {
        return false;
      }

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

    emptyState.classList.add('hidden');

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.dataset.url = item.url;

      const safeDownloadName = getSafeVideoFilename(item.filename, item.url, item.format, item.contentType);
      const isHls = item.format === 'M3U8' || item.url.toLowerCase().includes('.m3u8');
      const displayFormat = isHls ? 'M3U8' : (item.format || 'MP4');
      const badgeClass = isHls ? 'badge-m3u8' : getBadgeClass(item.format);

      const durationHtml = item.duration ? `<span class="media-duration-tag">⏱️ ${item.duration}</span>` : '';

      card.innerHTML = `
        <div class="card-top">
          <div class="title-container">
            <span class="media-title" title="${safeDownloadName}">${safeDownloadName}</span>
            <div class="media-meta-row">
              ${durationHtml}
              <span class="media-url" title="${item.url}">${item.url}</span>
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
          <div class="progress-info">${t('duration')}: ${item.duration || t('unknownDuration')}</div>
        </div>

        <div class="card-bottom">
          <span class="media-size">${item.duration ? `${t('duration')}: ${item.duration}` : (isHls ? t('fullStream') : (item.size || t('readyToDownload')))}</span>
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

        previewContainer.classList.remove('hidden');
        previewContainer.innerHTML = `
          <video class="preview-video" controls autoplay playsinline>
            <source src="${item.url}">
            ${t('formatNotSupportedPreview')}
          </video>
        `;

        const videoEl = previewContainer.querySelector('video');
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
        if (isHls) {
          const downloadId = btoa(item.url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
          
          const progressBox = card.querySelector('.progress-box');
          progressBox.classList.remove('hidden');
          downloadBtn.disabled = true;
          downloadBtn.textContent = t('downloading');

          chrome.runtime.sendMessage({
            type: 'START_HLS_DOWNLOAD',
            downloadId: downloadId,
            url: item.url,
            filename: safeDownloadName
          });

          if (!pollInterval) {
            pollInterval = setInterval(checkOngoingDownloads, 500);
          }
        } else {
          // Direct download & log to history
          chrome.runtime.sendMessage({
            type: 'LOG_DIRECT_DOWNLOAD',
            filename: safeDownloadName,
            url: item.url,
            size: item.size || 'Direct',
            duration: item.duration || ''
          });

          chrome.downloads.download({
            url: item.url,
            filename: safeDownloadName,
            saveAs: true
          });
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
      div.innerHTML = `
        <div class="history-title" title="${h.filename}">${h.filename}</div>
        <div class="history-meta">
          <span>${h.size} ${h.duration && h.duration !== 'N/A' ? `• ⏱️ ${h.duration}` : ''}</span>
          <span>${dateStr}</span>
        </div>
      `;
      historyListContainer.appendChild(div);
    });
  }

  function showEmptyState(customMessage) {
    mediaListContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    if (customMessage) {
      emptyState.querySelector('h3').textContent = customMessage;
    } else {
      emptyState.querySelector('h3').textContent = t('noVideosTitle');
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

  btnRefresh.addEventListener('click', () => {
    loadMedia();
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
    viewMain.classList.add('hidden');
    viewSettings.classList.remove('hidden');
    renderHistory();
  });

  btnBackMain.addEventListener('click', () => {
    viewSettings.classList.add('hidden');
    viewMain.classList.remove('hidden');
  });

  // Language switch
  selectLanguage.addEventListener('change', async (e) => {
    currentLang = e.target.value;
    await chrome.storage.local.set({ appLanguage: currentLang });
    applyLanguage();
  });

  // Auto-delete toggle
  chkAutoDelete.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ autoDelete24h: e.target.checked });
    renderHistory();
  });

  // Clear history
  btnClearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ downloadHistory: [] });
    renderHistory();
  });

  pollInterval = setInterval(checkOngoingDownloads, 500);

  loadMedia();
});
