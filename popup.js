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
  let pendingCancel = null; // { id, url }
  const confirmModal = document.getElementById('confirm-stop-modal');
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
    document.getElementById('txt-active-downloads').textContent = t('activeDownloads');
    btnClearHistory.textContent = t('clearHistory');
    btnBackMain.textContent = t('back');
    if (txtConfirmTitle) txtConfirmTitle.textContent = t('confirmStopTitle');
    if (txtConfirmDesc) txtConfirmDesc.textContent = t('confirmStopDesc');
    if (btnConfirmYes) btnConfirmYes.textContent = t('confirmYes');
    if (btnConfirmNo) btnConfirmNo.textContent = t('confirmNo');

    renderList();
    renderHistory();
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
      || urlLower.includes('.mp3') || urlLower.endsWith('.m4a') || urlLower.endsWith('.wav') || mimeLower.startsWith('audio/');
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
          const adlBar = card.querySelector('.adl-progress-bar-fill');
          const adlPercentEl = card.querySelector('.adl-percent');
          const adlSegEl = card.querySelector('.adl-segments');
          const adlDurEl = card.querySelector('.adl-duration');
          // bar width animates via CSS linear, set target immediately
          adlBar.style.width = `${dl.percent || 0}%`;

          // Controls (pause/resume + close) - rebuild each time
          const ctrlBox = card.querySelector('.adl-controls');
          ctrlBox.innerHTML = '';
          if (dl.status === 'downloading') {
            const pauseBtn = document.createElement('button');
            pauseBtn.className = 'btn-adl btn-adl-pause';
            pauseBtn.title = t('pause');
            pauseBtn.textContent = '⏸';
            pauseBtn.addEventListener('click', async () => {
              await chrome.runtime.sendMessage({ type: 'PAUSE_DOWNLOAD', downloadId: dl.id });
              checkOngoingDownloads();
            });
            ctrlBox.appendChild(pauseBtn);
          } else if (dl.status === 'paused') {
            const resumeBtn = document.createElement('button');
            resumeBtn.className = 'btn-adl btn-adl-resume';
            resumeBtn.title = t('resume');
            resumeBtn.textContent = '▶';
            resumeBtn.addEventListener('click', async () => {
              await chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOAD', downloadId: dl.id });
              checkOngoingDownloads();
            });
            ctrlBox.appendChild(resumeBtn);
          }
          {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'btn-adl btn-adl-close';
            closeBtn.title = 'Stop';
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', () => openConfirmModal(dl.id, dl.url));
            ctrlBox.appendChild(closeBtn);
          }

          if (dl.status === 'downloading') {
            let durationStr = '';
            if (dl.totalDurationFormatted) {
              durationStr = `${dl.downloadedDurationFormatted || '0s'} / ${dl.totalDurationFormatted}`;
            }
            adlSegEl.textContent = `${dl.completed || 0}/${dl.total || '?'}`;
            adlDurEl.textContent = durationStr;
            animatePercentCounter(dl.id, dl.percent || 0, (cur) => {
              adlPercentEl.textContent = `${t('downloading')} ${cur}%`;
            });
          } else if (dl.status === 'paused') {
            let durationStr = '';
            if (dl.totalDurationFormatted) {
              durationStr = `${dl.downloadedDurationFormatted || '0s'} / ${dl.totalDurationFormatted}`;
            }
            adlSegEl.textContent = `${dl.completed || 0}/${dl.total || '?'}`;
            adlDurEl.textContent = durationStr;
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
      // Only show controls for active/paused/merging/error/completed? show for downloading/paused/merging
      const showPause = dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging';
      const showClose = true; // always allow close after start
      ctr.innerHTML = '';
      if (showPause) {
        if (dl.status === 'paused') {
          const b = document.createElement('button');
          b.className = 'btn-progress btn-resume';
          b.textContent = t('resume');
          b.addEventListener('click', async () => {
            await chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOAD', downloadId: dl.id });
            checkOngoingDownloads();
          });
          ctr.appendChild(b);
        } else if (dl.status === 'downloading') {
          const b = document.createElement('button');
          b.className = 'btn-progress btn-pause';
          b.textContent = t('pause');
          b.addEventListener('click', async () => {
            await chrome.runtime.sendMessage({ type: 'PAUSE_DOWNLOAD', downloadId: dl.id });
            checkOngoingDownloads();
          });
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
      if (showClose) {
        const x = document.createElement('button');
        x.className = 'btn-progress btn-stop';
        x.title = 'Stop';
        x.textContent = '✕';
        x.addEventListener('click', () => openConfirmModal(dl.id, dl.url));
        ctr.appendChild(x);
      }
    }

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
        progressInfo.textContent = `${t('duration')}: ${dlState.totalDurationFormatted || t('unknownDuration')} (${cur}%)`;
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
        progressInfo.textContent = `${t('paused')} - ${cur}%`;
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

    emptyState.classList.add('hidden');

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.dataset.url = item.url;

      const safeDownloadName = getSafeVideoFilename(item.filename, item.url, item.format, item.contentType);
      const urlLower = item.url.toLowerCase();
      const isHls = item.format === 'M3U8' || item.format === 'MPD' || item.format === 'M3U' || urlLower.includes('.m3u8') || urlLower.includes('.mpd') || urlLower.includes('.m3u');
      const isStream = isHls || ['TS','M4S','FMP4','M2TS'].includes(item.format);
      const displayFormat = isHls ? (item.format === 'MPD' ? 'MPD' : 'M3U8') : (item.format || 'MP4');
      const badgeClass = isHls ? 'badge-m3u8' : isStream ? 'badge-m3u8' : getBadgeClass(item.format);

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
          <div class="preview-wrapper" style="position: relative; width: 100%;">
            <video class="preview-video" controls autoplay playsinline preload="auto" tabindex="0">
              <source src="${item.url}">
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
        const downloadId = btoa(item.url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
        const progressBox = card.querySelector('.progress-box');
        progressBox.classList.remove('hidden');
        downloadBtn.disabled = true;
        downloadBtn.textContent = t('downloading');

        // Alla tillåtna källor går via offscreen så de sparas som video (.mp4) med paus/stopp + progress
        const isDash = item.format === 'MPD' || item.url.toLowerCase().includes('.mpd');
        if (isHls || isDash) {
          chrome.runtime.sendMessage({
            type: 'START_HLS_DOWNLOAD',
            downloadId: downloadId,
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

  pollInterval = setInterval(checkOngoingDownloads, 120);

  loadMedia();
});
