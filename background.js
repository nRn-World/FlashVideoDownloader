// Flash Video Downloader - Background Service Worker (v3.1)
// HLS downloads are delegated to offscreen.js which has full DOM/Blob/ObjectURL access.

const tabMedia = new Map();
const activeDownloads = new Map();

// Media file extensions - utökad för alla tillåtna videokällor (sparas alltid som video)
const MEDIA_EXTENSIONS = [
  'mp4', 'm4v', 'm4s', 'fmp4', 'cmfv', 'cmfa',
  'webm', 'flv', 'f4v',
  'm3u8', 'm3u',
  'mpd',
  'ts', 'm2ts', 'mts',
  'mov', 'avi', 'mkv', 'ogv', '3gp', '3g2', 'wmv', 'av1', 'hevc', 'vob',
  'mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac', 'wma'
];

// Media MIME types - även generiska där filnamn indikerar video
const MEDIA_MIME_TYPES = [
  'video/', 'audio/',
  'application/x-mpegurl', 'application/vnd.apple.mpegurl',
  'application/dash+xml', 'application/vnd.ms-sstr+xml',
  'application/octet-stream', 'binary/octet-stream'
];

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function getFormat(url, contentType) {
  const urlLower = (url || '').toLowerCase();
  // Prioritera streaming-manifest
  if (urlLower.includes('.m3u8') || (contentType && contentType.includes('mpegurl'))) return 'M3U8';
  if (urlLower.includes('.mpd') || (contentType && contentType.includes('dash+xml'))) return 'MPD';
  for (const ext of MEDIA_EXTENSIONS) {
    if (urlLower.includes('.' + ext)) return ext.toUpperCase();
  }
  if (contentType) {
    if (contentType.includes('mp4')) return 'MP4';
    if (contentType.includes('webm')) return 'WEBM';
    if (contentType.includes('mpegurl') || contentType.includes('m3u8')) return 'M3U8';
    if (contentType.includes('dash+xml')) return 'MPD';
    if (contentType.includes('flv')) return 'FLV';
    if (contentType.includes('quicktime') || contentType.includes('mov')) return 'MOV';
    if (contentType.includes('x-matroska') || contentType.includes('mkv')) return 'MKV';
    if (contentType.includes('mp3') || contentType.includes('mpeg')) return 'MP3';
    if (contentType.includes('ogg')) return 'OGG';
    if (contentType.includes('video/')) return 'MP4';
    if (contentType.includes('audio/')) return 'MP3';
  }
  return 'MP4';
}

function getCleanFilename(url, headerFilename, contentType) {
  let baseName = '';
  if (headerFilename) {
    baseName = headerFilename;
  } else {
    try {
      const urlObj = new URL(url);
      // stöd även blob: URLs (hoppa över blob:-prefix)
      let workUrl = url;
      if (workUrl.startsWith('blob:')) workUrl = workUrl.slice(5);
      const urlObj2 = new URL(workUrl);
      let rawFilename = urlObj2.pathname.substring(urlObj2.pathname.lastIndexOf('/') + 1);
      if (rawFilename) baseName = decodeURIComponent(rawFilename.split('?')[0]);
    } catch (e) {}
  }

  if (!baseName || baseName.length < 2 || baseName === 'videoplayback' || baseName.startsWith('segment') || baseName.startsWith('master') || baseName.startsWith('index') || baseName.startsWith('playlist') || baseName.startsWith('chunk') || baseName.startsWith('frag')) {
    baseName = `video_${Date.now().toString().slice(-4)}`;
  }

  baseName = baseName.replace(/[/\\?%*:|"<>]/g, '_').trim();
  baseName = baseName.replace(/\.(php|aspx|asp|jsp|html|htm|bin|do|cgi|axd|mpd)$/i, '');

  const hasKnownMediaExt = MEDIA_EXTENSIONS.some(ext => baseName.toLowerCase().endsWith('.' + ext));
  // Alla tillåtna källor sparas som video (.mp4) för maximal kompatibilitet, utom ren audio
  if (!hasKnownMediaExt) {
    const urlLower = (url || '').toLowerCase();
    const mimeLower = (contentType || '').toLowerCase();
    // behåll audio som mp3, annars alltid mp4
    const isAudioOnly = mimeLower.includes('audio/') && !mimeLower.includes('video') && !urlLower.includes('.mp4') && !urlLower.includes('.m3u8') && !urlLower.includes('.mpd') && !urlLower.includes('video');
    if (isAudioOnly) {
      baseName = `${baseName}.mp3`;
    } else {
      baseName = `${baseName}.mp4`;
    }
  } else {
    // Normalisera streaming-manifest till .mp4 så användaren får en spelbar video
    if (baseName.toLowerCase().endsWith('.m3u8') || baseName.toLowerCase().endsWith('.m3u') || baseName.toLowerCase().endsWith('.mpd')) {
      baseName = baseName.replace(/\.(m3u8|m3u|mpd)$/i, '.mp4');
    } else if (baseName.toLowerCase().endsWith('.ts') || baseName.toLowerCase().endsWith('.m4s') || baseName.toLowerCase().endsWith('.fmp4')) {
      baseName = baseName.replace(/\.(ts|m4s|fmp4)$/i, '.mp4');
    }
  }

  return baseName;
}

function addMediaItem(tabId, item) {
  if (!tabId || tabId < 0) return;
  if (!tabMedia.has(tabId)) tabMedia.set(tabId, new Map());
  const mediaMap = tabMedia.get(tabId);
  if (!mediaMap.has(item.url)) {
    mediaMap.set(item.url, item);
    updateBadge(tabId);
  }
}

function updateBadge(tabId) {
  let activeDlCount = 0;
  let pausedCount = 0;
  for (const dl of activeDownloads.values()) {
    if (dl.status === 'downloading' || dl.status === 'merging') activeDlCount++;
    if (dl.status === 'paused') pausedCount++;
  }
  if (activeDlCount > 0) {
    chrome.action.setBadgeText({ text: '⚡' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    return;
  }
  if (pausedCount > 0) {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    return;
  }
  if (tabId) {
    const mediaMap = tabMedia.get(tabId);
    const count = mediaMap ? mediaMap.size : 0;
    if (count > 0) {
      chrome.action.setBadgeText({ tabId, text: count.toString() });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
    } else {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// === Network Sniffing ===
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const url = details.url;
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

    let contentType = '';
    let contentLength = 0;
    let contentDispositionFilename = '';

    if (details.responseHeaders) {
      for (const header of details.responseHeaders) {
        const name = header.name.toLowerCase();
        if (name === 'content-type') contentType = (header.value || '').toLowerCase();
        else if (name === 'content-length') contentLength = parseInt(header.value, 10) || 0;
        else if (name === 'content-disposition') {
          const match = /filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i.exec(header.value || '');
          if (match && match[1]) contentDispositionFilename = decodeURIComponent(match[1]);
        }
      }
    }

    const isMediaMime = MEDIA_MIME_TYPES.some(type => {
      if (type === 'application/octet-stream' || type === 'binary/octet-stream') {
        // generisk binär räknas bara som media om filnamn/extension hintar video eller disposition finns
        return contentType === type && (contentDispositionFilename || MEDIA_EXTENSIONS.some(ext => url.toLowerCase().includes('.'+ext)));
      }
      return contentType.startsWith(type);
    });
    const urlLower = url.toLowerCase();
    const hasMediaExt = MEDIA_EXTENSIONS.some(ext => new RegExp(`\\.${ext}(\\?|#|$)`, 'i').test(urlLower));
    const hasDispositionVideo = contentDispositionFilename && MEDIA_EXTENSIONS.some(ext => contentDispositionFilename.toLowerCase().endsWith('.'+ext));

    if (contentLength > 0 && contentLength < 15000 && !urlLower.includes('.m3u8') && !urlLower.includes('.mpd')) return;

    if (isMediaMime || hasMediaExt || hasDispositionVideo) {
      addMediaItem(details.tabId, {
        url, filename: getCleanFilename(url, contentDispositionFilename, contentType),
        format: getFormat(url, contentType), size: formatBytes(contentLength),
        rawSize: contentLength, contentType, initiator: details.initiator || '',
        discoveredAt: Date.now()
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabMedia.set(tabId, new Map());
    updateBadge(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => tabMedia.delete(tabId));

// === Offscreen Document Management ===
async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Download HLS segments, merge into full video, and save to disk via DOM Blob/ObjectURL'
  });
}

// === Download History ===
async function saveDownloadToHistory(item) {
  try {
    const data = await chrome.storage.local.get(['downloadHistory', 'autoDelete24h']);
    let history = data.downloadHistory || [];
    const autoDelete = data.autoDelete24h !== false;
    const now = Date.now();
    if (autoDelete) history = history.filter(h => h.timestamp > now - 86400000);
    history.unshift({
      id: 'dl_' + now, filename: item.filename, url: item.url,
      size: item.size || 'N/A', duration: item.duration || 'N/A', timestamp: now
    });
    if (history.length > 50) history = history.slice(0, 50);
    await chrome.storage.local.set({ downloadHistory: history });
  } catch (e) { console.error('Failed to save history:', e); }
}

async function purgeExpiredHistory() {
  try {
    const data = await chrome.storage.local.get(['downloadHistory', 'autoDelete24h']);
    if (data.autoDelete24h !== false && data.downloadHistory) {
      const cleaned = data.downloadHistory.filter(h => h.timestamp > Date.now() - 86400000);
      await chrome.storage.local.set({ downloadHistory: cleaned });
    }
  } catch (e) {}
}
purgeExpiredHistory();

// === HLS / Generic Download Trigger (delegates to offscreen.js) ===
async function startHlsDownload(downloadId, playlistUrl, filename) {
  activeDownloads.set(downloadId, {
    id: downloadId, url: playlistUrl, filename: filename,
    status: 'downloading', completed: 0, total: 0, percent: 0,
    totalDurationSec: 0, downloadedDurationSec: 0,
    totalDurationFormatted: '', downloadedDurationFormatted: '',
    error: null, totalBytes: 0
  });
  updateBadge();
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({
    type: 'START_OFFSCREEN_HLS',
    downloadId: downloadId,
    url: playlistUrl,
    filename: filename
  });
}

async function startGenericDownload(downloadId, fileUrl, filename) {
  activeDownloads.set(downloadId, {
    id: downloadId, url: fileUrl, filename: filename,
    status: 'downloading', completed: 0, total: 1, percent: 0,
    totalDurationSec: 0, downloadedDurationSec: 0,
    totalDurationFormatted: '', downloadedDurationFormatted: '',
    error: null, totalBytes: 0
  });
  updateBadge();
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({
    type: 'START_OFFSCREEN_GENERIC',
    downloadId: downloadId,
    url: fileUrl,
    filename: filename
  });
}

// === Message Dispatcher ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // From popup: get detected media for a tab
  if (message.type === 'GET_MEDIA') {
    const mediaMap = tabMedia.get(message.tabId);
    sendResponse({ media: mediaMap ? Array.from(mediaMap.values()) : [] });
  }
  // From content script: DOM-discovered media
  else if (message.type === 'FOUND_DOM_MEDIA') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId && Array.isArray(message.items)) {
      message.items.forEach(item => {
        addMediaItem(tabId, {
          url: item.url, filename: item.filename || getCleanFilename(item.url, '', ''),
          format: item.format || getFormat(item.url, ''), size: item.size || '',
          duration: item.duration || '', rawSize: 0, contentType: 'video/mp4',
          discoveredAt: Date.now()
        });
      });
      sendResponse({ status: 'ok' });
    }
  }
  // From popup: clear media list
  else if (message.type === 'CLEAR_MEDIA') {
    if (message.tabId) {
      tabMedia.set(message.tabId, new Map());
      updateBadge(message.tabId);
      sendResponse({ status: 'ok' });
    }
  }
  // From popup: start HLS / generic download (all tillåtna källor sparas som video)
  else if (message.type === 'START_HLS_DOWNLOAD') {
    startHlsDownload(message.downloadId, message.url, message.filename);
    sendResponse({ status: 'started' });
  }
  else if (message.type === 'START_GENERIC_DOWNLOAD') {
    startGenericDownload(message.downloadId, message.url, message.filename);
    sendResponse({ status: 'started' });
  }
  // From popup: get all download states
  else if (message.type === 'GET_ALL_DOWNLOADS') {
    sendResponse({ downloads: Array.from(activeDownloads.values()) });
  }
  // From popup: log a direct (non-HLS) download to history
  else if (message.type === 'LOG_DIRECT_DOWNLOAD') {
    saveDownloadToHistory({
      filename: message.filename, url: message.url,
      size: message.size || 'Direct', duration: message.duration || ''
    });
    sendResponse({ status: 'ok' });
  }
  // From offscreen.js: progress update
  else if (message.type === 'OFFSCREEN_PROGRESS') {
    if (message.state && message.state.id) {
      // cancelled from offscreen -> remove locally too
      if (message.state.status === 'cancelled') {
        activeDownloads.delete(message.state.id);
        updateBadge();
        sendResponse({ status: 'ok' });
        return true;
      }
      activeDownloads.set(message.state.id, message.state);

      // Update badge with percentage
      if (message.state.status === 'downloading' && message.state.percent) {
        chrome.action.setBadgeText({ text: `${message.state.percent}%` });
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
      } else if (message.state.status === 'paused') {
        chrome.action.setBadgeText({ text: '⏸' });
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      } else if (message.state.status === 'merging') {
        chrome.action.setBadgeText({ text: '💾' });
      } else if (message.state.status === 'completed') {
        chrome.action.setBadgeText({ text: '✅' });
        setTimeout(() => updateBadge(), 5000);
      } else if (message.state.status === 'error') {
        chrome.action.setBadgeText({ text: '❌' });
      }
    }
    sendResponse({ status: 'ok' });
  }
  // From offscreen.js: download completed, save to history
  else if (message.type === 'OFFSCREEN_DOWNLOAD_COMPLETE') {
    saveDownloadToHistory({
      filename: message.filename, url: message.url,
      size: message.size || 'Stream', duration: message.duration || ''
    });
    sendResponse({ status: 'ok' });
  }
  // From popup: pause / resume / cancel HLS
  else if (message.type === 'PAUSE_DOWNLOAD') {
    const dl = activeDownloads.get(message.downloadId);
    if (dl) {
      dl.status = 'paused';
      activeDownloads.set(message.downloadId, dl);
      chrome.action.setBadgeText({ text: '⏸' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      ensureOffscreenDocument().then(() => {
        chrome.runtime.sendMessage({ type: 'PAUSE_OFFSCREEN_HLS', downloadId: message.downloadId });
      }).catch(() => {});
    }
    sendResponse({ status: 'paused' });
  }
  else if (message.type === 'RESUME_DOWNLOAD') {
    const dl = activeDownloads.get(message.downloadId);
    if (dl) {
      dl.status = 'downloading';
      activeDownloads.set(message.downloadId, dl);
      chrome.action.setBadgeText({ text: `${dl.percent || 0}%` });
      chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
      ensureOffscreenDocument().then(() => {
        chrome.runtime.sendMessage({ type: 'RESUME_OFFSCREEN_HLS', downloadId: message.downloadId });
      }).catch(() => {});
    }
    sendResponse({ status: 'resumed' });
  }
  else if (message.type === 'CANCEL_DOWNLOAD') {
    const dl = activeDownloads.get(message.downloadId);
    activeDownloads.delete(message.downloadId);
    updateBadge();
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({ type: 'CANCEL_OFFSCREEN_HLS', downloadId: message.downloadId });
    }).catch(() => {});
    sendResponse({ status: 'cancelled' });
  }
  else if (message.type === 'REMOVE_DOWNLOAD_ENTRY') {
    // Remove completed/error entry from active list (X on finished)
    activeDownloads.delete(message.downloadId);
    updateBadge();
    sendResponse({ status: 'removed' });
  }

  return true;
});
