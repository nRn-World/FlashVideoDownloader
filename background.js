// Flash Video Downloader - Background Service Worker (v3.3.0)
// HLS downloads are delegated to offscreen.js which has full DOM/Blob/ObjectURL access.

importScripts('blocked-hosts.js');
importScripts('license.js');
importScripts('pro-gates.js');

const tabMedia = new Map();
const activeDownloads = new Map();
const cleanupScheduled = new Set();
const chromeDownloadMap = new Map(); // chrome.downloads id -> extension download id

function urlHasExt(urlLower, ext) {
  // Allow trailing slash after extension (common on KVS tube sites: .../720p.mp4/)
  return new RegExp(
    `\\.${ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\/*(?:\\?|#|$)|\\/+)`,
    'i'
  ).test(urlLower);
}

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
  // Prioritera streaming-manifest (exakta filändelser – undvik att .fmp4 matchar .mp4)
  if (urlHasExt(urlLower, 'm3u8') || urlHasExt(urlLower, 'm3u') || (contentType && contentType.includes('mpegurl'))) return 'M3U8';
  if (urlHasExt(urlLower, 'mpd') || (contentType && contentType.includes('dash+xml'))) return 'MPD';
  for (const ext of MEDIA_EXTENSIONS) {
    if (urlHasExt(urlLower, ext)) return ext.toUpperCase();
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
      const workUrl = url.startsWith('blob:') ? url.slice(5) : url;
      const urlObj = new URL(workUrl);
      // Strip trailing slashes so .../720p.mp4/ still yields 720p.mp4
      const path = urlObj.pathname.replace(/\/+$/, '');
      let rawFilename = path.substring(path.lastIndexOf('/') + 1);
      if (rawFilename) baseName = decodeURIComponent(rawFilename.split('?')[0]);
    } catch (e) {}
  }

  if (!baseName || baseName.length < 2 || baseName === 'videoplayback' || baseName.startsWith('segment') || baseName.startsWith('master') || baseName.startsWith('index') || baseName.startsWith('playlist') || baseName.startsWith('chunk') || baseName.startsWith('frag') || baseName === 'get_file') {
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

function isTubeCmsVideoUrl(url) {
  const u = (url || '').toLowerCase();
  // Kernel Video Sharing / similar adult CMS delivery paths
  if (/\/get_file\//i.test(u)) return true;
  if (/\/video[_-]?file\//i.test(u)) return true;
  if (/\/contents\/videos?\//i.test(u) && /\.(mp4|webm|m3u8|mov)/i.test(u)) return true;
  return false;
}

function isStreamingSegmentUrl(url) {
  const u = (url || '').toLowerCase();
  if (/\.(ts|m4s|fmp4|cmfv|cmfa|vtt|srt)(?:\/*(?:\?|#|$)|\/+)/i.test(u)) return true;
  if (/\/(segment|segments|chunk|chunks|frag|fragment)(\/|[_-]|\d)/i.test(u)) return true;
  return false;
}

function isPreviewMediaUrl(url) {
  const u = (url || '').toLowerCase();
  // Real video files from tube CMS / quality variants are not previews
  if (isTubeCmsVideoUrl(u)) return false;
  if (/\b(240p|360p|480p|720p|1080p|1440p|2160p|4k)\b/i.test(u)) return false;
  if (urlHasExt(u, 'm3u8') || urlHasExt(u, 'mpd')) return false;
  // Match preview tokens as path/query parts — avoid over-matching (e.g. bare "icon")
  return /(?:^|[\/_\-.?&=])(thumbnails?|preview|poster|sprite|placeholder|avatar|favicon|banner)(?:[\/_\-.?&=]|$)/i.test(u);
}

function addMediaItem(tabId, item) {
  if (!tabId || tabId < 0) return;
  if (item.url && typeof fvdIsBlockedUrl === 'function' && fvdIsBlockedUrl(item.url)) return;
  if (!tabMedia.has(tabId)) tabMedia.set(tabId, new Map());
  const mediaMap = tabMedia.get(tabId);
  if (mediaMap.has(item.url)) {
    const existing = mediaMap.get(item.url);
    const merged = { ...existing, ...item };
    if (!item.duration && existing.duration) merged.duration = existing.duration;
    if (!item.rawSize && existing.rawSize) merged.rawSize = existing.rawSize;
    if (!item.size && existing.size) merged.size = existing.size;
    if (existing.discoveredAt && !item.discoveredAt) merged.discoveredAt = existing.discoveredAt;
    mediaMap.set(item.url, merged);
  } else {
    mediaMap.set(item.url, item);
  }
  updateBadge(tabId);
}

async function persistActiveDownloads() {
  try {
    await chrome.storage.session.set({
      activeDownloads: Array.from(activeDownloads.values())
    });
  } catch (e) { /* session storage unavailable on very old Chrome */ }
}

async function restoreActiveDownloads() {
  try {
    const data = await chrome.storage.session.get(['activeDownloads']);
    if (!data.activeDownloads || !Array.isArray(data.activeDownloads)) return;
    for (const dl of data.activeDownloads) {
      if (!dl || !dl.id) continue;
      if (dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging') {
        dl.status = 'error';
        dl.error = 'Download interrupted (extension restarted). Please try again.';
      }
      activeDownloads.set(dl.id, dl);
    }
    updateBadge();
  } catch (e) {}
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
    if (!url || fvdIsBlockedUrl(url)) return;

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
        return contentType === type && (contentDispositionFilename || MEDIA_EXTENSIONS.some(ext => url.toLowerCase().includes('.'+ext)) || isTubeCmsVideoUrl(url));
      }
      return contentType.startsWith(type);
    });
    const urlLower = url.toLowerCase();
    const hasMediaExt = MEDIA_EXTENSIONS.some(ext => urlHasExt(urlLower, ext));
    const hasDispositionVideo = contentDispositionFilename && MEDIA_EXTENSIONS.some(ext => contentDispositionFilename.toLowerCase().endsWith('.'+ext));
    const looksLikeTubeVideo = isTubeCmsVideoUrl(url);

    if (contentLength > 0 && contentLength < 15000 && !urlLower.includes('.m3u8') && !urlLower.includes('.mpd') && !urlLower.includes('.m3u') && !looksLikeTubeVideo) return;

    if (isStreamingSegmentUrl(url) || isPreviewMediaUrl(url)) return;

    if (isMediaMime || hasMediaExt || hasDispositionVideo || looksLikeTubeVideo) {
      // Never show file size for streaming manifests - 6.5KB is the playlist, not the video (would be false info for a 21min video)
      const isManifest = urlLower.includes('.m3u8') || urlLower.includes('.m3u') || urlLower.includes('.mpd') || urlLower.includes('.m4s') || urlLower.includes('.fmp4') || (contentType.includes('mpegurl') || contentType.includes('dash+xml'));
      const format = getFormat(url, contentType);
      const STREAM_FORMATS = new Set(['M3U8','M3U','MPD','M4S','FMP4','TS','M2TS']);
      const isStreamFormat = STREAM_FORMATS.has(format);
      const reliableSize = (!isManifest && !isStreamFormat && contentLength > 0) ? formatBytes(contentLength) : '';
      const reliableRaw = (!isManifest && !isStreamFormat && contentLength > 0) ? contentLength : 0;
      addMediaItem(details.tabId, {
        url, filename: getCleanFilename(url, contentDispositionFilename, contentType),
        format: format, size: reliableSize,
        rawSize: reliableRaw, contentType, initiator: details.initiator || '',
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

// === Offscreen Document Management (defensive - fixes background.js:0 anonymous function on older Chrome) ===
async function ensureOffscreenDocument() {
  try {
    if (!chrome.offscreen || typeof chrome.offscreen.hasDocument !== 'function') {
      console.warn('[FVD] chrome.offscreen not available - requires Chrome 109+');
      return;
    }
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Download HLS segments, merge into full video, and save to disk via DOM Blob/ObjectURL'
    });
    await new Promise(r => setTimeout(r, 80));
  } catch (e) {
    console.warn('[FVD] ensureOffscreenDocument failed:', e && e.message ? e.message : e);
  }
}

async function setDownloadControlFlag(downloadId, control) {
  const key = 'dlCtrl_' + downloadId;
  await chrome.storage.session.set({ [key]: control });
}

async function clearDownloadControlFlag(downloadId) {
  try {
    await chrome.storage.session.remove('dlCtrl_' + downloadId);
  } catch (e) {}
}

async function forwardToOffscreen(type, downloadId) {
  await ensureOffscreenDocument();
  try {
    return await chrome.runtime.sendMessage({ type, downloadId });
  } catch (e) {
    return null;
  }
}

// === Download History ===
function sanitizeHistoryUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch (e) {
    return (url || '').split('?')[0].split('#')[0];
  }
}

async function shouldPromptForSave() {
  try {
    if (!chrome.storage || !chrome.storage.local) return false;
    const data = await chrome.storage.local.get(['askSaveEachTime', 'useDefaultDownloadFolder', 'useCustomDirectory']);
    if (data.useDefaultDownloadFolder === true && data.useCustomDirectory === true) {
      return false;
    }
    return data.askSaveEachTime === true;
  } catch (e) {
    return false;
  }
}

function emitDownloadProgress(dl) {
  if (!dl) return;
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_PROGRESS', state: { ...dl } }).catch(() => {});
}

function scheduleDownloadCleanup(extId) {
  if (cleanupScheduled.has(extId)) return;
  cleanupScheduled.add(extId);
  setTimeout(() => {
    cleanupScheduled.delete(extId);
    const cur = activeDownloads.get(extId);
    if (cur && (cur.status === 'completed' || cur.status === 'error')) {
      activeDownloads.delete(extId);
      persistActiveDownloads();
      updateBadge();
    }
  }, 45000);
}

function completeTrackedDownload(extId) {
  const dl = activeDownloads.get(extId);
  if (!dl) return;
  dl.status = 'completed';
  dl.percent = 100;
  activeDownloads.set(extId, dl);
  persistActiveDownloads();
  emitDownloadProgress(dl);
  Promise.resolve(
    saveDownloadToHistory({
      filename: dl.filename,
      url: dl.url,
      size: dl.size || 'Direct',
      duration: dl.duration || ''
    })
  ).catch((e) => console.warn('[FVD] history save:', e && e.message ? e.message : e));
  updateBadge();
  scheduleDownloadCleanup(extId);
}

function failTrackedDownload(extId, message) {
  const dl = activeDownloads.get(extId);
  if (!dl) return;
  dl.status = 'error';
  dl.error = message || 'Download failed';
  activeDownloads.set(extId, dl);
  persistActiveDownloads();
  emitDownloadProgress(dl);
  updateBadge();
  scheduleDownloadCleanup(extId);
}

chrome.downloads.onChanged.addListener((delta) => {
  const extId = chromeDownloadMap.get(delta.id);
  if (!extId) return;
  const dl = activeDownloads.get(extId);
  if (!dl) return;

  if (delta.bytesReceived && delta.totalBytes) {
    const received = delta.bytesReceived.current || 0;
    const total = delta.totalBytes.current || 0;
    if (total > 0) {
      dl.percent = Math.min(99, Math.round((received / total) * 100));
      dl.totalBytes = received;
      activeDownloads.set(extId, dl);
      emitDownloadProgress(dl);
    }
  }

  if (delta.state && delta.state.current === 'complete') {
    chromeDownloadMap.delete(delta.id);
    completeTrackedDownload(extId);
  } else if (delta.error) {
    chromeDownloadMap.delete(delta.id);
    failTrackedDownload(extId, delta.error.current || 'Download failed');
  } else if (delta.state && delta.state.current === 'interrupted') {
    chromeDownloadMap.delete(delta.id);
    failTrackedDownload(extId, 'Download interrupted');
  }
});

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['blocked-hosts.js', 'content.js']
    });
  } catch (e) {
    console.warn('[FVD] ensureContentScript:', e && e.message ? e.message : e);
  }
}

async function saveFileViaDownloads(blobUrl, filename) {
  const safeName = (filename || 'video.mp4').replace(/[/\\?%*:|"<>]/g, '_').replace(/^\/+/, '');
  return chrome.downloads.download({
    url: blobUrl,
    filename: safeName,
    saveAs: await shouldPromptForSave()
  });
}

async function saveUrlViaDownloads(fileUrl, filename) {
  const safeName = (filename || 'video.mp4').replace(/[/\\?%*:|"<>]/g, '_').replace(/^\/+/, '');
  return chrome.downloads.download({
    url: fileUrl,
    filename: safeName,
    saveAs: await shouldPromptForSave()
  });
}

async function saveDownloadToHistory(item) {
  try {
    if (!chrome.storage || !chrome.storage.local) return;
    const data = await chrome.storage.local.get(['downloadHistory', 'autoDelete24h']);
    let history = data.downloadHistory || [];
    const autoDelete = data.autoDelete24h !== false;
    const now = Date.now();
    if (autoDelete) history = history.filter(h => h.timestamp > now - 86400000);
    history.unshift({
      id: 'dl_' + now,
      filename: item.filename,
      url: sanitizeHistoryUrl(item.url),
      size: item.size || 'N/A',
      duration: item.duration || 'N/A',
      timestamp: now
    });
    
    // Apply Pro limits
    const limit = await getHistoryLimit();
    if (history.length > limit) history = history.slice(0, limit);
    
    await chrome.storage.local.set({ downloadHistory: history });
  } catch (e) { console.warn('[FVD] Failed to save history:', e && e.message ? e.message : e); }
}

async function purgeExpiredHistory() {
  try {
    const data = await chrome.storage.local.get(['downloadHistory', 'autoDelete24h']);
    if (data.autoDelete24h !== false && data.downloadHistory) {
      const cleaned = data.downloadHistory.filter(h => h.timestamp > Date.now() - 86400000);
      await chrome.storage.local.set({ downloadHistory: cleaned });
    }
  } catch (e) {
    console.warn('[FVD] purgeExpiredHistory:', e && e.message ? e.message : e);
  }
}
try { purgeExpiredHistory(); restoreActiveDownloads(); } catch(e) {}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      useDefaultDownloadFolder: false,
      useCustomDirectory: false,
      askSaveEachTime: false,
      autoDelete24h: true
    });
  }
});

self.addEventListener('error', (e) => console.error('[FVD background error]', e && e.message ? e.message : e));
self.addEventListener('unhandledrejection', (e) => console.error('[FVD unhandled]', e && e.reason ? e.reason : e));

// === HLS / Generic Download Trigger (delegates to offscreen.js) ===
async function startHlsDownload(downloadId, playlistUrl, filename, pageReferer) {
  try {
    activeDownloads.set(downloadId, {
      id: downloadId, url: playlistUrl, filename: filename,
      status: 'downloading', completed: 0, total: 0, percent: 0,
      totalDurationSec: 0, downloadedDurationSec: 0,
      totalDurationFormatted: '', downloadedDurationFormatted: '',
      error: null, totalBytes: 0
    });
    updateBadge();
    persistActiveDownloads();
    await ensureOffscreenDocument();
    try {
      await chrome.runtime.sendMessage({
        type: 'START_OFFSCREEN_HLS',
        downloadId: downloadId,
        url: playlistUrl,
        filename: filename,
        pageReferer: pageReferer || null
      });
    } catch (e) {
      // Fallback to direct download if offscreen not available
      console.warn('[FVD] HLS offscreen failed, fallback:', e && e.message);
      activeDownloads.set(downloadId, { ...activeDownloads.get(downloadId), status: 'error', error: 'Offscreen not available - update Chrome to 109+' });
      updateBadge();
    }
  } catch (e) { console.error('[FVD] startHlsDownload', e); }
}

async function startDashDownload(downloadId, mpdUrl, filename, pageReferer) {
  try {
    activeDownloads.set(downloadId, {
      id: downloadId, url: mpdUrl, filename: filename,
      status: 'downloading', completed: 0, total: 0, percent: 0,
      totalDurationSec: 0, downloadedDurationSec: 0,
      totalDurationFormatted: '', downloadedDurationFormatted: '',
      error: null, totalBytes: 0
    });
    updateBadge();
    persistActiveDownloads();
    await ensureOffscreenDocument();
    try {
      await chrome.runtime.sendMessage({
        type: 'START_OFFSCREEN_DASH',
        downloadId,
        url: mpdUrl,
        filename,
        pageReferer: pageReferer || null
      });
    } catch (e) {
      console.warn('[FVD] DASH offscreen failed:', e && e.message);
      activeDownloads.set(downloadId, {
        ...activeDownloads.get(downloadId),
        status: 'error',
        error: 'Offscreen not available - update Chrome to 109+'
      });
      updateBadge();
    }
  } catch (e) { console.error('[FVD] startDashDownload', e); }
}

async function startBlobDownload(downloadId, tabId, blobUrl, filename) {
  const dlState = {
    id: downloadId, url: blobUrl, filename: filename,
    status: 'downloading', completed: 0, total: 1, percent: 0,
    totalDurationSec: 0, downloadedDurationSec: 0,
    totalDurationFormatted: '', downloadedDurationFormatted: '',
    error: null, totalBytes: 0
  };
  activeDownloads.set(downloadId, dlState);
  updateBadge();
  persistActiveDownloads();

  try {
    await ensureContentScript(tabId);
    const blobResponse = await chrome.tabs.sendMessage(tabId, {
      type: 'DOWNLOAD_BLOB',
      url: blobUrl,
      filename: filename
    });

    if (blobResponse && blobResponse.ok) {
      dlState.status = 'completed';
      dlState.percent = 100;
      dlState.totalBytes = blobResponse.size || 0;
      activeDownloads.set(downloadId, dlState);
      persistActiveDownloads();
      emitDownloadProgress(dlState);
      saveDownloadToHistory({
        filename,
        url: blobUrl,
        size: blobResponse.size ? formatBytes(blobResponse.size) : 'Blob',
        duration: ''
      });
      updateBadge();
      scheduleDownloadCleanup(downloadId);
      return;
    }

    const errMsg = blobResponse && blobResponse.error ? blobResponse.error : 'Blob download failed';
    throw new Error(errMsg);
  } catch (e) {
    console.error('[FVD] startBlobDownload', e);
    failTrackedDownload(downloadId, e && e.message ? e.message : 'Blob download failed');
  }
}

async function startGenericDownload(downloadId, fileUrl, filename, pageReferer) {
  if (fileUrl && fileUrl.startsWith('blob:')) {
    console.warn('[FVD] blob: URL must use START_BLOB_DOWNLOAD');
    return;
  }

  const dlState = {
    id: downloadId, url: fileUrl, filename: filename,
    status: 'downloading', completed: 0, total: 1, percent: 5,
    totalDurationSec: 0, downloadedDurationSec: 0,
    totalDurationFormatted: '', downloadedDurationFormatted: '',
    error: null, totalBytes: 0
  };
  activeDownloads.set(downloadId, dlState);
  updateBadge();
  persistActiveDownloads();

  try {
    const chromeDlId = await saveUrlViaDownloads(fileUrl, filename);
    chromeDownloadMap.set(chromeDlId, downloadId);
    dlState.percent = 15;
    activeDownloads.set(downloadId, dlState);
    persistActiveDownloads();
    emitDownloadProgress(dlState);
  } catch (primaryErr) {
    console.warn('[FVD] chrome.downloads failed, trying offscreen fetch:', primaryErr && primaryErr.message);
    try {
      await ensureOffscreenDocument();
      await chrome.runtime.sendMessage({
        type: 'START_OFFSCREEN_GENERIC',
        downloadId: downloadId,
        url: fileUrl,
        filename: filename,
        pageReferer: pageReferer || null
      });
    } catch (fallbackErr) {
      failTrackedDownload(
        downloadId,
        (primaryErr && primaryErr.message) || (fallbackErr && fallbackErr.message) || 'Download failed'
      );
    }
  }
}

function resolvePageReferer(message) {
  if (message.pageReferer) return message.pageReferer;
  if (message.pageUrl) return message.pageUrl;
  if (message.referer) return message.referer;
  // Fall back to sniffed initiator for this media URL on the tab
  try {
    if (message.tabId != null && message.url) {
      const mediaMap = tabMedia.get(message.tabId);
      const item = mediaMap && mediaMap.get(message.url);
      if (item && item.initiator) return item.initiator;
    }
  } catch (e) {}
  return null;
}

// === Message Dispatcher ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IS_URL_BLOCKED') {
    sendResponse({ blocked: fvdIsBlockedUrl(message.url) });
  }
  else if (message.type === 'PURGE_HISTORY') {
    purgeExpiredHistory().then(() => sendResponse({ status: 'ok' }));
    return true;
  }
  else if (message.type === 'SAVE_DOWNLOAD_FILE') {
    saveFileViaDownloads(message.blobUrl, message.filename)
      .then(() => sendResponse({ status: 'ok' }))
      .catch(err => sendResponse({ status: 'error', error: err && err.message ? err.message : 'Download failed' }));
    return true;
  }
  else if (message.type === 'GET_MEDIA') {
    const mediaMap = tabMedia.get(message.tabId);
    sendResponse({ media: mediaMap ? Array.from(mediaMap.values()) : [] });
  }
  else if (message.type === 'REFRESH_MEDIA') {
    const tabId = message.tabId;
    const mediaMap = tabMedia.get(tabId);
    if (mediaMap) {
      for (const url of [...mediaMap.keys()]) {
        if (isStreamingSegmentUrl(url) || isPreviewMediaUrl(url)) {
          mediaMap.delete(url);
        }
      }
      updateBadge(tabId);
      sendResponse({ media: Array.from(mediaMap.values()), status: 'ok' });
    } else {
      sendResponse({ media: [], status: 'ok' });
    }
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
  // From popup: start HLS / DASH / generic download
  else if (message.type === 'START_HLS_DOWNLOAD') {
    if (fvdIsBlockedUrl(message.url)) {
      sendResponse({ status: 'blocked' });
      return true;
    }
    startHlsDownload(message.downloadId, message.url, message.filename, resolvePageReferer(message));
    sendResponse({ status: 'started' });
  }
  else if (message.type === 'START_DASH_DOWNLOAD') {
    if (fvdIsBlockedUrl(message.url)) {
      sendResponse({ status: 'blocked' });
      return true;
    }
    startDashDownload(message.downloadId, message.url, message.filename, resolvePageReferer(message));
    sendResponse({ status: 'started' });
  }
  else if (message.type === 'START_GENERIC_DOWNLOAD') {
    if (fvdIsBlockedUrl(message.url)) {
      sendResponse({ status: 'blocked' });
      return true;
    }
    startGenericDownload(message.downloadId, message.url, message.filename, resolvePageReferer(message));
    sendResponse({ status: 'started' });
  }
  else if (message.type === 'START_BLOB_DOWNLOAD') {
    if (fvdIsBlockedUrl(message.url)) {
      sendResponse({ status: 'blocked' });
      return true;
    }
    startBlobDownload(message.downloadId, message.tabId, message.url, message.filename);
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
        persistActiveDownloads();
        clearDownloadControlFlag(message.state.id);
        updateBadge();
        sendResponse({ status: 'ok' });
        return true;
      }
      activeDownloads.set(message.state.id, message.state);
      persistActiveDownloads();

      // Auto-remove completed/error entries after 45s so the banner doesn't grow forever
      if (message.state.status === 'completed' || message.state.status === 'error') {
        clearDownloadControlFlag(message.state.id);
        const sid = message.state.id;
        if (!cleanupScheduled.has(sid)) {
          cleanupScheduled.add(sid);
          setTimeout(() => {
            cleanupScheduled.delete(sid);
            const cur = activeDownloads.get(sid);
            if (cur && (cur.status === 'completed' || cur.status === 'error')) {
              activeDownloads.delete(sid);
              persistActiveDownloads();
              updateBadge();
            }
          }, 45000);
        }
      }

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
  // From popup: pause / resume / cancel
  else if (message.type === 'PAUSE_DOWNLOAD') {
    (async () => {
      const dl = activeDownloads.get(message.downloadId);
      if (dl) {
        dl.status = 'paused';
        activeDownloads.set(message.downloadId, dl);
        persistActiveDownloads();
        await setDownloadControlFlag(message.downloadId, 'paused');
        chrome.action.setBadgeText({ text: '⏸' });
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
        await forwardToOffscreen('PAUSE_OFFSCREEN_DOWNLOAD', message.downloadId);
      }
      sendResponse({ status: 'paused' });
    })();
    return true;
  }
  else if (message.type === 'RESUME_DOWNLOAD') {
    (async () => {
      const dl = activeDownloads.get(message.downloadId);
      if (dl) {
        dl.status = 'downloading';
        activeDownloads.set(message.downloadId, dl);
        persistActiveDownloads();
        await setDownloadControlFlag(message.downloadId, 'downloading');
        chrome.action.setBadgeText({ text: `${dl.percent || 0}%` });
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
        await forwardToOffscreen('RESUME_OFFSCREEN_DOWNLOAD', message.downloadId);
      }
      sendResponse({ status: 'resumed' });
    })();
    return true;
  }
  else if (message.type === 'CANCEL_DOWNLOAD') {
    (async () => {
      const dl = activeDownloads.get(message.downloadId);
      if (dl) {
        dl.status = 'cancelled';
        activeDownloads.set(message.downloadId, dl);
        persistActiveDownloads();
        await setDownloadControlFlag(message.downloadId, 'cancelled');
        updateBadge();
        await forwardToOffscreen('CANCEL_OFFSCREEN_DOWNLOAD', message.downloadId);
      }
      sendResponse({ status: 'cancelled' });
    })();
    return true;
  }
  else if (message.type === 'REMOVE_DOWNLOAD_ENTRY') {
    activeDownloads.delete(message.downloadId);
    persistActiveDownloads();
    updateBadge();
    sendResponse({ status: 'removed' });
  }
  // License activation
  else if (message.type === 'ACTIVATE_LICENSE') {
    (async () => {
      const result = await activateLicense(message.key);
      sendResponse(result);
    })();
    return true;
  }
  else if (message.type === 'DEACTIVATE_LICENSE') {
    (async () => {
      const result = await deactivateLicense();
      sendResponse(result);
    })();
    return true;
  }
  else if (message.type === 'CHECK_LICENSE_STATUS') {
    (async () => {
      const status = await checkLicenseStatus();
      sendResponse(status);
    })();
    return true;
  }

  return true;
});
