// Flash Video Downloader - Background Service Worker (v3.0 PRO) with Offscreen Document Saver

const tabMedia = new Map();
const activeDownloads = new Map();

// Media file extensions
const MEDIA_EXTENSIONS = [
  'mp4', 'm4v', 'webm', 'flv', 'f4v', 'm3u8', 'ts', 'mov', 'avi', 'mkv', 'ogv',
  '3gp', 'wmv', 'mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus'
];

// Media MIME types
const MEDIA_MIME_TYPES = [
  'video/', 'audio/', 'application/x-mpegurl', 'application/vnd.apple.mpegurl',
  'application/dash+xml', 'application/vnd.ms-sstr+xml'
];

function formatDurationSeconds(sec) {
  if (!sec || isNaN(sec) || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}m ${s}s`;
}

function determineTargetExtension(url, contentType, formatHint) {
  const urlLower = (url || '').toLowerCase();
  const mimeLower = (contentType || '').toLowerCase();
  const hintLower = (formatHint || '').toLowerCase();

  if (hintLower === 'webm' || urlLower.includes('.webm') || mimeLower.includes('webm')) return 'webm';
  if (hintLower === 'flv' || urlLower.includes('.flv') || mimeLower.includes('flv')) return 'flv';
  if (hintLower === 'mkv' || urlLower.includes('.mkv')) return 'mkv';
  if (hintLower === 'mov' || urlLower.includes('.mov') || mimeLower.includes('quicktime')) return 'mov';
  if (hintLower === 'mp3' || urlLower.includes('.mp3') || mimeLower.includes('audio/mp3') || mimeLower.includes('audio/mpeg')) return 'mp3';
  if (hintLower === 'm3u8' || urlLower.includes('.m3u8') || mimeLower.includes('mpegurl')) return 'm3u8';
  return 'mp4';
}

function getCleanFilename(url, headerFilename, contentType) {
  let baseName = '';
  if (headerFilename) {
    baseName = headerFilename;
  } else {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      let rawFilename = pathname.substring(pathname.lastIndexOf('/') + 1);
      if (rawFilename) {
        baseName = decodeURIComponent(rawFilename.split('?')[0]);
      }
    } catch (e) {}
  }

  if (!baseName || baseName.length < 2 || baseName === 'videoplayback' || baseName.startsWith('segment') || baseName.startsWith('master') || baseName.startsWith('index') || baseName.startsWith('playlist')) {
    baseName = `video_${Date.now().toString().slice(-4)}`;
  }

  baseName = baseName.replace(/[/\\?%*:|"<>]/g, '_').trim();
  baseName = baseName.replace(/\.(php|aspx|asp|jsp|html|htm|bin|do|cgi)$/i, '');

  const targetExt = determineTargetExtension(url, contentType, '');
  const extRegex = new RegExp(`\\.${targetExt}$`, 'i');

  if (!extRegex.test(baseName)) {
    const hasKnownMediaExt = MEDIA_EXTENSIONS.some(ext => baseName.toLowerCase().endsWith('.' + ext));
    if (!hasKnownMediaExt) {
      baseName = `${baseName}.${targetExt}`;
    }
  }

  return baseName;
}

function getFormat(url, contentType) {
  const urlLower = (url || '').toLowerCase();
  for (const ext of MEDIA_EXTENSIONS) {
    if (urlLower.includes('.' + ext)) {
      return ext.toUpperCase();
    }
  }
  if (contentType) {
    if (contentType.includes('mp4')) return 'MP4';
    if (contentType.includes('webm')) return 'WEBM';
    if (contentType.includes('mpegurl') || contentType.includes('m3u8')) return 'M3U8';
    if (contentType.includes('flv')) return 'FLV';
    if (contentType.includes('mp3') || contentType.includes('mpeg')) return 'MP3';
    if (contentType.includes('ogg')) return 'OGG';
    if (contentType.includes('video/')) return 'MP4';
    if (contentType.includes('audio/')) return 'MP3';
  }
  return 'MP4';
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function addMediaItem(tabId, item) {
  if (!tabId || tabId < 0) return;
  if (!tabMedia.has(tabId)) {
    tabMedia.set(tabId, new Map());
  }
  const mediaMap = tabMedia.get(tabId);
  if (!mediaMap.has(item.url)) {
    mediaMap.set(item.url, item);
    updateBadge(tabId);
  }
}

function updateBadge(tabId) {
  let activeDlCount = 0;
  for (const dl of activeDownloads.values()) {
    if (dl.status === 'downloading' || dl.status === 'merging') activeDlCount++;
  }

  if (activeDlCount > 0) {
    chrome.action.setBadgeText({ text: '⚡' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    return;
  }

  const mediaMap = tabMedia.get(tabId);
  const count = mediaMap ? mediaMap.size : 0;
  if (count > 0) {
    chrome.action.setBadgeText({ tabId, text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// Sniff network traffic
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
        if (name === 'content-type') {
          contentType = (header.value || '').toLowerCase();
        } else if (name === 'content-length') {
          contentLength = parseInt(header.value, 10) || 0;
        } else if (name === 'content-disposition') {
          const match = /filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i.exec(header.value || '');
          if (match && match[1]) {
            contentDispositionFilename = decodeURIComponent(match[1]);
          }
        }
      }
    }

    const isMediaMime = MEDIA_MIME_TYPES.some(type => contentType.startsWith(type));
    const urlLower = url.toLowerCase();
    const hasMediaExt = MEDIA_EXTENSIONS.some(ext => {
      const regex = new RegExp(`\\.${ext}(\\?|#|$)`, 'i');
      return regex.test(urlLower);
    });

    if (contentLength > 0 && contentLength < 15000 && !urlLower.includes('.m3u8')) {
      return;
    }

    if (isMediaMime || hasMediaExt) {
      const format = getFormat(url, contentType);
      const filename = getCleanFilename(url, contentDispositionFilename, contentType);
      const sizeFormatted = formatBytes(contentLength);

      addMediaItem(details.tabId, {
        url: url,
        filename: filename,
        format: format,
        size: sizeFormatted,
        rawSize: contentLength,
        contentType: contentType,
        initiator: details.initiator || '',
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

chrome.tabs.onRemoved.addListener((tabId) => {
  tabMedia.delete(tabId);
});

// Säkerställ att ett offscreen-dokument finns för att hantera storskalig filsparande
async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Create object URLs and save assembled large video streams directly to disk'
  });
}

// Download History Handler
async function saveDownloadToHistory(item) {
  try {
    const data = await chrome.storage.local.get(['downloadHistory', 'autoDelete24h']);
    let history = data.downloadHistory || [];
    const autoDelete = data.autoDelete24h !== false;

    const now = Date.now();
    if (autoDelete) {
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      history = history.filter(h => h.timestamp > oneDayAgo);
    }

    history.unshift({
      id: 'dl_' + now,
      filename: item.filename,
      url: item.url,
      size: item.size || 'N/A',
      duration: item.duration || 'N/A',
      timestamp: now
    });

    if (history.length > 50) history = history.slice(0, 50);

    await chrome.storage.local.set({ downloadHistory: history });
  } catch (e) {
    console.error('Failed to save download history:', e);
  }
}

async function purgeExpiredHistory() {
  try {
    const data = await chrome.storage.local.get(['downloadHistory', 'autoDelete24h']);
    const autoDelete = data.autoDelete24h !== false;
    if (autoDelete && data.downloadHistory) {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const cleaned = data.downloadHistory.filter(h => h.timestamp > oneDayAgo);
      await chrome.storage.local.set({ downloadHistory: cleaned });
    }
  } catch (e) {}
}
purgeExpiredHistory();

// =======================================================
// TURBO-SPEED BACKGROUND HLS DOWNLOAD ENGINE
// =======================================================

async function startBackgroundHlsDownload(downloadId, playlistUrl, filename) {
  const downloadState = {
    id: downloadId,
    url: playlistUrl,
    filename: filename,
    status: 'downloading',
    completed: 0,
    total: 0,
    percent: 0,
    speedMB: 0,
    totalDurationSec: 0,
    downloadedDurationSec: 0,
    totalDurationFormatted: '',
    downloadedDurationFormatted: '',
    error: null,
    totalBytes: 0
  };

  activeDownloads.set(downloadId, downloadState);
  updateBadge();

  try {
    const startTime = Date.now();

    // 1. Fetch playlist
    const res = await fetch(playlistUrl);
    if (!res.ok) throw new Error('Could not fetch M3U8 link.');
    let text = await res.text();
    let targetPlaylistUrl = playlistUrl;

    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split('\n');
      let maxBw = 0;
      let bestStreamPath = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          const bwMatch = line.match(/BANDWIDTH=(\d+)/);
          const bw = bwMatch ? parseInt(bwMatch[1], 10) : 1;
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine && !nextLine.startsWith('#')) {
              if (bw >= maxBw) {
                maxBw = bw;
                bestStreamPath = nextLine;
              }
              break;
            }
          }
        }
      }

      if (bestStreamPath) {
        targetPlaylistUrl = new URL(bestStreamPath, playlistUrl).href;
        const subRes = await fetch(targetPlaylistUrl);
        if (!subRes.ok) throw new Error('Could not load sub-playlist.');
        text = await subRes.text();
      }
    }

    // 2. Parse segments and calculate total duration
    const segments = [];
    const lines = text.split('\n');
    let currentExtinfDuration = 0;
    let totalSec = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const durMatch = line.match(/#EXTINF:([\d.]+)/);
        currentExtinfDuration = durMatch ? parseFloat(durMatch[1]) : 0;
      } else if (line && !line.startsWith('#')) {
        try {
          const fullUrl = new URL(line, targetPlaylistUrl).href;
          segments.push({
            url: fullUrl,
            duration: currentExtinfDuration
          });
          totalSec += currentExtinfDuration;
          currentExtinfDuration = 0;
        } catch (e) {}
      }
    }

    if (segments.length === 0) {
      throw new Error('No video segments found in playlist.');
    }

    downloadState.total = segments.length;
    downloadState.totalDurationSec = Math.round(totalSec);
    downloadState.totalDurationFormatted = formatDurationSeconds(Math.round(totalSec));

    const total = segments.length;
    const buffers = new Array(total);
    let completed = 0;
    let currentIndex = 0;
    let totalLoadedBytes = 0;
    let currentLoadedSec = 0;

    const concurrency = Math.min(20, total);

    async function worker() {
      while (currentIndex < total) {
        if (downloadState.status === 'cancelled') return;

        const idx = currentIndex++;
        const seg = segments[idx];
        let attempts = 3;
        while (attempts > 0) {
          try {
            const segRes = await fetch(seg.url, { cache: 'no-store' });
            if (!segRes.ok) throw new Error('Segment error');
            const ab = await segRes.arrayBuffer();
            buffers[idx] = ab;
            completed++;
            totalLoadedBytes += ab.byteLength;
            currentLoadedSec += seg.duration;

            downloadState.completed = completed;
            downloadState.percent = Math.round((completed / total) * 100);
            downloadState.downloadedDurationSec = Math.round(currentLoadedSec);
            downloadState.downloadedDurationFormatted = formatDurationSeconds(Math.round(currentLoadedSec));

            const elapsedSec = (Date.now() - startTime) / 1000;
            if (elapsedSec > 0) {
              downloadState.speedMB = ((totalLoadedBytes / (1024 * 1024)) / elapsedSec).toFixed(1);
            }

            if (completed % 15 === 0 || completed === total) {
              chrome.action.setBadgeText({ text: `${downloadState.percent}%` });
            }
            break;
          } catch (e) {
            attempts--;
            if (attempts === 0) throw e;
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (downloadState.status === 'cancelled') return;

    downloadState.status = 'merging';
    chrome.action.setBadgeText({ text: '💾' });

    // 3. Spara och trigga nedladdning via Offscreen Document (helt befriad från storleksbegränsningar och behörighetsfel)
    await ensureOffscreenDocument();

    const saveResponse = await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_CHUNKS',
      chunks: buffers,
      filename: filename,
      mimeType: 'video/mp4'
    });

    if (saveResponse && saveResponse.status === 'ok') {
      downloadState.totalBytes = saveResponse.size || totalLoadedBytes;
      downloadState.status = 'completed';
      downloadState.percent = 100;
      updateBadge();

      saveDownloadToHistory({
        filename: filename,
        url: playlistUrl,
        size: formatBytes(saveResponse.size || totalLoadedBytes),
        duration: downloadState.totalDurationFormatted || 'Stream'
      });
    } else {
      throw new Error(saveResponse?.error || 'Failed to trigger file download via offscreen writer.');
    }

  } catch (err) {
    console.error('Background HLS download error:', err);
    downloadState.status = 'error';
    downloadState.error = err.message || 'Download failed.';
    updateBadge();
  }
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_MEDIA') {
    const tabId = message.tabId;
    const mediaMap = tabMedia.get(tabId);
    const mediaList = mediaMap ? Array.from(mediaMap.values()) : [];
    sendResponse({ media: mediaList });
  } 
  else if (message.type === 'FOUND_DOM_MEDIA') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId && Array.isArray(message.items)) {
      message.items.forEach(item => {
        addMediaItem(tabId, {
          url: item.url,
          filename: item.filename || getCleanFilename(item.url, '', ''),
          format: item.format || getFormat(item.url, ''),
          size: item.size || '',
          duration: item.duration || '',
          rawSize: 0,
          contentType: 'video/mp4',
          discoveredAt: Date.now()
        });
      });
      sendResponse({ status: 'ok' });
    }
  } 
  else if (message.type === 'CLEAR_MEDIA') {
    if (message.tabId) {
      tabMedia.set(message.tabId, new Map());
      updateBadge(message.tabId);
      sendResponse({ status: 'ok' });
    }
  }
  else if (message.type === 'START_HLS_DOWNLOAD') {
    const { downloadId, url, filename } = message;
    startBackgroundHlsDownload(downloadId, url, filename);
    sendResponse({ status: 'started' });
  }
  else if (message.type === 'GET_DOWNLOAD_STATUS') {
    const { downloadId } = message;
    const state = activeDownloads.get(downloadId);
    sendResponse({ state: state || null });
  }
  else if (message.type === 'GET_ALL_DOWNLOADS') {
    const list = Array.from(activeDownloads.values());
    sendResponse({ downloads: list });
  }
  else if (message.type === 'LOG_DIRECT_DOWNLOAD') {
    saveDownloadToHistory({
      filename: message.filename,
      url: message.url,
      size: message.size || 'Direct',
      duration: message.duration || ''
    });
    sendResponse({ status: 'ok' });
  }

  return true;
});
