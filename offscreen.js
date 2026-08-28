// Flash Video Downloader - Offscreen HLS Download Engine (Full Pipeline)
// This runs in a real DOM context with URL.createObjectURL, Blob, and anchor downloads.

const activeDownloadsMap = new Map();
const downloadAbortControllers = new Map();
let activeDownload = null; // last active (compat)

function getAbortSignal(downloadId) {
  if (!downloadAbortControllers.has(downloadId)) {
    downloadAbortControllers.set(downloadId, new AbortController());
  }
  return downloadAbortControllers.get(downloadId).signal;
}

function abortDownloadFetches(downloadId) {
  const ac = downloadAbortControllers.get(downloadId);
  if (ac) ac.abort();
  downloadAbortControllers.delete(downloadId);
}

function cleanupDownloadAbort(downloadId) {
  downloadAbortControllers.delete(downloadId);
}

async function syncDownloadControlFromSession(dl) {
  if (!dl || !dl.id) return;
  try {
    const key = 'dlCtrl_' + dl.id;
    const data = await chrome.storage.session.get(key);
    const ctrl = data[key];
    if (ctrl === 'cancelled') {
      dl.status = 'cancelled';
      abortDownloadFetches(dl.id);
    } else if (ctrl === 'paused' && dl.status === 'downloading') {
      dl.status = 'paused';
    } else if (ctrl === 'downloading' && dl.status === 'paused') {
      dl.status = 'downloading';
    }
  } catch (e) {}
}

function getDl(id) {
  return activeDownloadsMap.get(id) || null;
}

function formatDurationSeconds(sec) {
  if (!sec || isNaN(sec) || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

async function deliverDownload(blobUrl, filename) {
  const blob = await fetch(blobUrl).then(r => r.blob());
  const data = await chrome.storage.local.get(['useDefaultDownloadFolder', 'useCustomDirectory']);

  if (data.useDefaultDownloadFolder === true && data.useCustomDirectory === true && typeof fvdWriteBlobToDirectory === 'function') {
    const ok = await fvdWriteBlobToDirectory(blob, filename);
    if (ok) return;
  }

  const res = await chrome.runtime.sendMessage({
    type: 'SAVE_DOWNLOAD_FILE',
    blobUrl,
    filename
  });
  if (!res || res.status === 'error') {
    throw new Error((res && res.error) || 'Could not save file');
  }
}

/** Remux MPEG-TS HLS segments into a playable MP4 using mux.js (included in lib/) */
function remuxTsSegmentsToMp4(tsBuffers) {
  if (typeof muxjs === 'undefined' || !muxjs.mp4 || !muxjs.mp4.Transmuxer) {
    console.warn('[FVD Offscreen] mux.js unavailable – saving raw TS container');
    return new Blob(tsBuffers, { type: 'video/mp2t' });
  }
  const transmuxer = new muxjs.mp4.Transmuxer({ keepOriginalTimestamps: true });
  const mp4Parts = [];
  let initSegment = null;

  transmuxer.on('data', (segment) => {
    if (segment.initSegment) initSegment = segment.initSegment;
    if (segment.data) mp4Parts.push(segment.data);
  });

  for (const buf of tsBuffers) {
    if (!buf) continue;
    transmuxer.push(new Uint8Array(buf));
    transmuxer.flush();
  }

  if (initSegment) mp4Parts.unshift(initSegment);
  if (mp4Parts.length === 0) {
    return new Blob(tsBuffers, { type: 'video/mp2t' });
  }
  return new Blob(mp4Parts, { type: 'video/mp4' });
}

function mergeHlsBuffers(buffers, segments) {
  const usesTs = segments.some(s => /\.ts(\?|#|$)/i.test(s.url));
  if (usesTs) {
    const tsOnly = buffers.filter(Boolean);
    return remuxTsSegmentsToMp4(tsOnly);
  }
  return new Blob(buffers.filter(Boolean), { type: 'video/mp4' });
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function buildAesIv(sequenceNumber, customIv) {
  if (customIv && customIv.length === 16) return customIv;
  const iv = new Uint8Array(16);
  new DataView(iv.buffer).setUint32(12, sequenceNumber, false);
  return iv;
}

function parseHlsKeyLine(line, targetPlaylistUrl) {
  const methodMatch = line.match(/METHOD=([^,\s]+)/);
  if (!methodMatch) return null;
  if (methodMatch[1] === 'NONE') return null;
  if (methodMatch[1] !== 'AES-128') {
    throw new Error(`Krypteringsmetod ${methodMatch[1]} stöds inte än`);
  }
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (!uriMatch) return null;
  const keyUrl = new URL(uriMatch[1], targetPlaylistUrl).href;
  let iv = null;
  const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/i);
  if (ivMatch) iv = hexToBytes(ivMatch[1]);
  return { keyUrl, iv };
}

async function fetchAesKeyBytes(keyUrl) {
  const res = await fetch(keyUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('Kunde inte hämta krypteringsnyckel (AES-128)');
  return new Uint8Array(await res.arrayBuffer());
}

async function decryptAes128Segment(encryptedBuffer, keyBytes, ivBytes) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: ivBytes }, cryptoKey, encryptedBuffer
  );
  return new Uint8Array(decrypted);
}

async function resolveSegmentBuffer(rawBuffer, seg, keyCache) {
  if (!seg.keyInfo) return rawBuffer;
  if (!keyCache.has(seg.keyInfo.keyUrl)) {
    keyCache.set(seg.keyInfo.keyUrl, await fetchAesKeyBytes(seg.keyInfo.keyUrl));
  }
  const keyBytes = keyCache.get(seg.keyInfo.keyUrl);
  const iv = buildAesIv(seg.sequence, seg.keyInfo.iv);
  const decrypted = await decryptAes128Segment(rawBuffer, keyBytes, iv);
  return decrypted;
}

function parseHlsPlaylist(text, targetPlaylistUrl) {
  const segments = [];
  const lines = text.split('\n');
  let currentExtinfDuration = 0;
  let totalSec = 0;
  let mediaSequence = 0;
  let currentKeyInfo = null;
  let isLive = !text.includes('#EXT-X-ENDLIST');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parseInt(line.split(':')[1], 10) || 0;
    } else if (line.startsWith('#EXT-X-KEY:')) {
      currentKeyInfo = parseHlsKeyLine(line, targetPlaylistUrl);
    } else if (line.startsWith('#EXTINF:')) {
      const durMatch = line.match(/#EXTINF:([\d.]+)/);
      currentExtinfDuration = durMatch ? parseFloat(durMatch[1]) : 0;
    } else if (line && !line.startsWith('#')) {
      try {
        const fullUrl = new URL(line, targetPlaylistUrl).href;
        segments.push({
          url: fullUrl,
          duration: currentExtinfDuration,
          keyInfo: currentKeyInfo,
          sequence: mediaSequence
        });
        totalSec += currentExtinfDuration;
        mediaSequence++;
        currentExtinfDuration = 0;
      } catch (e) {}
    }
  }
  return { segments, totalSec, isLive };
}

async function waitIfPaused(dl) {
  while (dl && dl.status === 'paused') {
    await syncDownloadControlFromSession(dl);
    if (dl.status === 'cancelled') return false;
    if (dl.status !== 'paused') break;
    await new Promise(r => setTimeout(r, 150));
    if (dl.status === 'cancelled') return false;
  }
  await syncDownloadControlFromSession(dl);
  return dl && dl.status !== 'cancelled';
}

async function runHlsDownload(downloadId, playlistUrl, filename) {
  const dl = {
    id: downloadId,
    url: playlistUrl,
    filename: filename,
    status: 'downloading',
    completed: 0,
    total: 0,
    percent: 0,
    totalDurationSec: 0,
    downloadedDurationSec: 0,
    totalDurationFormatted: '',
    downloadedDurationFormatted: '',
    error: null,
    totalBytes: 0
  };
  activeDownloadsMap.set(downloadId, dl);
  activeDownload = dl;
  reportProgressFor(dl);
  const fetchSignal = getAbortSignal(downloadId);

  try {
    // 1. Fetch master playlist (respect pause)
    if (!await waitIfPaused(dl)) return;
    const res = await fetch(playlistUrl, { signal: fetchSignal });
    if (!res.ok) throw new Error('Could not fetch M3U8 playlist.');
    if (dl.status === 'cancelled') return;
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
              if (bw >= maxBw) { maxBw = bw; bestStreamPath = nextLine; }
              break;
            }
          }
        }
      }
      if (bestStreamPath) {
        if (!await waitIfPaused(dl)) return;
        targetPlaylistUrl = new URL(bestStreamPath, playlistUrl).href;
        const subRes = await fetch(targetPlaylistUrl, { signal: fetchSignal });
        if (!subRes.ok) throw new Error('Could not load sub-playlist.');
        if (dl.status === 'cancelled') return;
        text = await subRes.text();
      }
    }

    // 2. Parse segments (supports AES-128 keys + live/VOD detection)
    const { segments, totalSec, isLive } = parseHlsPlaylist(text, targetPlaylistUrl);
    if (segments.length === 0) throw new Error('No video segments found in playlist.');
    if (isLive) throw new Error('Live-strömmar stöds inte – vänta tills videon spelats klart eller pausa live-sändningen.');

    const total = segments.length;
    dl.total = total;
    dl.totalDurationSec = Math.round(totalSec);
    dl.totalDurationFormatted = formatDurationSeconds(Math.round(totalSec));
    reportProgressFor(dl);

    // 3. Download segments with concurrency + pause/cancel support
    const buffers = new Array(total);
    const keyCache = new Map();
    let completed = 0;
    let currentIndex = 0;
    let totalLoadedBytes = 0;
    let currentLoadedSec = 0;
    const concurrency = Math.min(20, total);

    // Report every integer percent immediately (1-100, no skips), throttle only same-percent updates
    let lastReportAt = 0;
    let lastReportedPercent = -1;
    let pendingReportTimer = null;

    function scheduleProgressReport(force) {
      const now = Date.now();
      const percentChanged = dl.percent !== lastReportedPercent;
      if (percentChanged) {
        // integer percent changed -> report immediately so 1,2,3... all appear
        lastReportAt = now;
        lastReportedPercent = dl.percent;
        if (pendingReportTimer) { clearTimeout(pendingReportTimer); pendingReportTimer = null; }
        reportProgressFor(dl);
        return;
      }
      // same percent -> throttle to avoid spam
      const timeSince = now - lastReportAt;
      if (force || dl.completed === total) {
        lastReportAt = now;
        reportProgressFor(dl);
        if (pendingReportTimer) { clearTimeout(pendingReportTimer); pendingReportTimer = null; }
      } else if (timeSince >= 80) {
        lastReportAt = now;
        reportProgressFor(dl);
      } else if (!pendingReportTimer) {
        pendingReportTimer = setTimeout(() => {
          pendingReportTimer = null;
          lastReportAt = Date.now();
          reportProgressFor(dl);
        }, 80 - timeSince);
      }
    }

    async function worker() {
      while (true) {
        await syncDownloadControlFromSession(dl);
        if (dl.status === 'cancelled') return;
        if (dl.status === 'paused') {
          if (!await waitIfPaused(dl)) return;
        }
        if (currentIndex >= total) return;
        const idx = currentIndex++;
        const seg = segments[idx];
        let attempts = 3;
        while (attempts > 0) {
          await syncDownloadControlFromSession(dl);
          if (dl.status === 'cancelled') return;
          if (dl.status === 'paused') {
            if (!await waitIfPaused(dl)) return;
          }
          try {
            const segRes = await fetch(seg.url, { cache: 'no-store', signal: fetchSignal });
            if (!segRes.ok) throw new Error(`Segment ${idx} fetch failed`);
            let ab = await segRes.arrayBuffer();
            if (seg.keyInfo) {
              ab = await resolveSegmentBuffer(ab, seg, keyCache);
            }
            if (dl.status === 'cancelled') return;
            buffers[idx] = ab;
            completed++;
            totalLoadedBytes += (ab.byteLength || ab.length || 0);
            currentLoadedSec += seg.duration;

            dl.completed = completed;
            // use precise rounding but ensure monotonic 0-100
            dl.percent = Math.min(100, Math.round((completed / total) * 100));
            dl.downloadedDurationSec = Math.round(currentLoadedSec);
            dl.downloadedDurationFormatted = formatDurationSeconds(Math.round(currentLoadedSec));
            dl.totalBytes = totalLoadedBytes;

            scheduleProgressReport(false);
            break;
          } catch (e) {
            attempts--;
            if (dl.status === 'cancelled') return;
            if (dl.status === 'paused') {
              if (!await waitIfPaused(dl)) return;
              attempts = 3;
              continue;
            }
            if (attempts === 0) throw e;
            await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);

    // flush any pending throttled report so 100% is not missed
    if (pendingReportTimer) { clearTimeout(pendingReportTimer); pendingReportTimer = null; }
    if (lastReportedPercent !== dl.percent) {
      lastReportedPercent = dl.percent;
      reportProgressFor(dl);
    }

    if (dl.status === 'cancelled') {
      activeDownloadsMap.delete(downloadId);
      cleanupDownloadAbort(downloadId);
      if (activeDownload && activeDownload.id === downloadId) activeDownload = null;
      return;
    }
    // if paused at the very end, wait until resumed before merging
    if (dl.status === 'paused') {
      if (!await waitIfPaused(dl)) return;
    }
    if (dl.status === 'cancelled') return;

    // 4. Merge
    dl.status = 'merging';
    dl.percent = 100;
    reportProgressFor(dl);

    const mergedBlob = mergeHlsBuffers(buffers, segments);
    dl.totalBytes = mergedBlob.size;

    console.log(`[FVD Offscreen] Merged blob size: ${mergedBlob.size} bytes (${formatBytes(mergedBlob.size)})`);

    const blobUrl = URL.createObjectURL(mergedBlob);
    const savedFilename = (mergedBlob.type === 'video/mp2t' && filename.endsWith('.mp4'))
      ? filename.replace(/\.mp4$/i, '.ts') : filename;
    try {
      await deliverDownload(blobUrl, savedFilename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    }

    dl.status = 'completed';
    dl.percent = 100;
    reportProgressFor(dl);
    cleanupDownloadAbort(downloadId);

    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD_COMPLETE',
      downloadId: downloadId,
      filename: savedFilename,
      url: playlistUrl,
      size: formatBytes(mergedBlob.size),
      duration: dl.totalDurationFormatted || 'Stream'
    });

  } catch (err) {
    console.error('[FVD Offscreen] Download error:', err);
    cleanupDownloadAbort(downloadId);
    if (dl.status === 'cancelled' || err.name === 'AbortError') {
      activeDownloadsMap.delete(downloadId);
      if (activeDownload && activeDownload.id === downloadId) activeDownload = null;
      return;
    }
    dl.status = 'error';
    dl.error = err.message || 'Download failed.';
    reportProgressFor(dl);
  }
}

async function runBufferDownload(downloadId, buffer, filename) {
  const dl = {
    id: downloadId,
    url: 'blob:',
    filename: filename,
    status: 'merging',
    completed: 1,
    total: 1,
    percent: 100,
    totalDurationSec: 0,
    downloadedDurationSec: 0,
    totalDurationFormatted: '',
    downloadedDurationFormatted: '',
    error: null,
    totalBytes: buffer.byteLength || 0
  };
  activeDownloadsMap.set(downloadId, dl);
  activeDownload = dl;
  reportProgressFor(dl);

  try {
    const lowerName = filename.toLowerCase();
    let mime = 'video/mp4';
    if (lowerName.endsWith('.webm')) mime = 'video/webm';
    else if (lowerName.endsWith('.mkv')) mime = 'video/x-matroska';
    else if (lowerName.endsWith('.avi')) mime = 'video/x-msvideo';
    else if (lowerName.endsWith('.mp3')) mime = 'audio/mpeg';

    const mergedBlob = new Blob([buffer], { type: mime });
    dl.totalBytes = mergedBlob.size;
    dl.status = 'merging';
    reportProgressFor(dl);

    const blobUrl = URL.createObjectURL(mergedBlob);
    try {
      await deliverDownload(blobUrl, filename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    }

    dl.status = 'completed';
    dl.percent = 100;
    reportProgressFor(dl);
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD_COMPLETE',
      downloadId: downloadId,
      filename: filename,
      url: 'blob:',
      size: formatBytes(mergedBlob.size),
      duration: 'Blob'
    });
  } catch (err) {
    dl.status = 'error';
    dl.error = err.message || 'Blob-sparning misslyckades';
    reportProgressFor(dl);
  }
}

async function runGenericDownload(downloadId, fileUrl, filename) {
  const dl = {
    id: downloadId,
    url: fileUrl,
    filename: filename,
    status: 'downloading',
    completed: 0,
    total: 1,
    percent: 0,
    totalDurationSec: 0,
    downloadedDurationSec: 0,
    totalDurationFormatted: '',
    downloadedDurationFormatted: '',
    error: null,
    totalBytes: 0
  };
  activeDownloadsMap.set(downloadId, dl);
  activeDownload = dl;
  reportProgressFor(dl);

  let fakeTimer = null;
  const fetchSignal = getAbortSignal(downloadId);
  try {
    if (!await waitIfPaused(dl)) return;
    const res = await fetch(fileUrl, { cache: 'no-store', signal: fetchSignal });
    if (!res.ok) throw new Error(`Kunde inte hämta fil (${res.status})`);
    if (dl.status === 'cancelled') return;

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    const hasLength = contentLength > 0;
    const total = hasLength ? contentLength : 0;
    dl.total = hasLength ? total : 1;
    // för okänd längd – fejka 1-95% under nedladdning så användaren ser levande progress
    if (!hasLength) {
      fakeTimer = setInterval(() => {
        if (dl.status !== 'downloading') return;
        if (dl.percent < 95) {
          dl.percent = Math.min(95, dl.percent + 1);
          reportProgressFor(dl);
        }
      }, 350);
    }

    const reader = res.body ? res.body.getReader() : null;
    const chunks = [];
    let received = 0;

    if (reader) {
      while (true) {
        await syncDownloadControlFromSession(dl);
        if (dl.status === 'cancelled') {
          try { await reader.cancel(); } catch(e) {}
          return;
        }
        if (dl.status === 'paused') {
          if (!await waitIfPaused(dl)) return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          dl.totalBytes = received;
          dl.completed = 1;
          if (hasLength) {
            dl.percent = Math.min(99, Math.round((received / total) * 100));
          }
          // vid okänd längd drivs percent av fakeTimer, men uppdatera bytes ändå
          if (hasLength || received % (256*1024) < 65536) reportProgressFor(dl);
        }
      }
    } else {
      const ab = await res.arrayBuffer();
      if (dl.status === 'cancelled') return;
      if (dl.status === 'paused') { if (!await waitIfPaused(dl)) return; }
      chunks.push(new Uint8Array(ab));
      received = ab.byteLength;
      dl.totalBytes = received;
    }

    if (fakeTimer) { clearInterval(fakeTimer); fakeTimer = null; }
    if (dl.status === 'cancelled') return;
    if (dl.status === 'paused') { if (!await waitIfPaused(dl)) return; }

    // Merge chunks -> Blob (alltid video/mp4 för "spara som video")
    dl.status = 'merging';
    dl.percent = 100;
    reportProgressFor(dl);

    // Bygg Blob – behåll original container-typ via filändelse
    const blobParts = chunks.map(c => c instanceof Uint8Array ? c : new Uint8Array(c));
    const lowerName = filename.toLowerCase();
    let mime = 'video/mp4';
    if (lowerName.endsWith('.avi')) mime = 'video/x-msvideo';
    else if (lowerName.endsWith('.mkv')) mime = 'video/x-matroska';
    else if (lowerName.endsWith('.webm')) mime = 'video/webm';
    else if (lowerName.endsWith('.mov')) mime = 'video/quicktime';
    else if (lowerName.endsWith('.flv')) mime = 'video/x-flv';
    else if (lowerName.endsWith('.wmv')) mime = 'video/x-ms-wmv';
    else if (lowerName.endsWith('.mp3')) mime = 'audio/mpeg';
    const mergedBlob = new Blob(blobParts, { type: mime });
    dl.totalBytes = mergedBlob.size;
    console.log(`[FVD Offscreen] Generic merged ${mergedBlob.size} bytes`);

    const blobUrl = URL.createObjectURL(mergedBlob);
    try {
      await deliverDownload(blobUrl, filename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    }

    dl.status = 'completed';
    dl.percent = 100;
    reportProgressFor(dl);
    cleanupDownloadAbort(downloadId);
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD_COMPLETE',
      downloadId: downloadId,
      filename: filename,
      url: fileUrl,
      size: formatBytes(mergedBlob.size),
      duration: dl.totalDurationFormatted || 'Video'
    });
  } catch (err) {
    if (fakeTimer) clearInterval(fakeTimer);
    cleanupDownloadAbort(downloadId);
    console.error('[FVD Offscreen] Generic error:', err);
    if (dl.status === 'cancelled' || err.name === 'AbortError') {
      activeDownloadsMap.delete(downloadId);
      return;
    }
    dl.status = 'error';
    dl.error = err.message || 'Nedladdning misslyckades';
    reportProgressFor(dl);
  }
}

function reportProgressFor(dl) {
  if (!dl) return;
  activeDownload = dl;
  chrome.runtime.sendMessage({
    type: 'OFFSCREEN_PROGRESS',
    state: { ...dl }
  }).catch(() => {});
}

function reportProgress() {
  if (!activeDownload) return;
  reportProgressFor(activeDownload);
}

// Listen for commands from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_HLS') {
    const { downloadId, url, filename } = message;
    runHlsDownload(downloadId, url, filename);
    sendResponse({ status: 'started' });
  } else if (message.type === 'START_OFFSCREEN_GENERIC') {
    const { downloadId, url, filename } = message;
    runGenericDownload(downloadId, url, filename);
    sendResponse({ status: 'started' });
  } else if (message.type === 'START_OFFSCREEN_BUFFER') {
    const { downloadId, filename, buffer } = message;
    runBufferDownload(downloadId, buffer, filename);
    sendResponse({ status: 'started' });
  } else if (message.type === 'GET_OFFSCREEN_STATUS') {
    sendResponse({ state: activeDownload });
  } else if (message.type === 'PAUSE_OFFSCREEN_DOWNLOAD' || message.type === 'PAUSE_OFFSCREEN_HLS') {
    const dl = getDl(message.downloadId);
    if (dl && dl.status === 'downloading') {
      dl.status = 'paused';
      reportProgressFor(dl);
    }
    sendResponse({ status: 'ok' });
  } else if (message.type === 'RESUME_OFFSCREEN_DOWNLOAD' || message.type === 'RESUME_OFFSCREEN_HLS') {
    const dl = getDl(message.downloadId);
    if (dl && dl.status === 'paused') {
      dl.status = 'downloading';
      reportProgressFor(dl);
    }
    sendResponse({ status: 'ok' });
  } else if (message.type === 'CANCEL_OFFSCREEN_DOWNLOAD' || message.type === 'CANCEL_OFFSCREEN_HLS') {
    const dl = getDl(message.downloadId);
    if (dl) {
      dl.status = 'cancelled';
      abortDownloadFetches(message.downloadId);
      reportProgressFor(dl);
      setTimeout(() => {
        activeDownloadsMap.delete(message.downloadId);
        cleanupDownloadAbort(message.downloadId);
        if (activeDownload && activeDownload.id === message.downloadId) {
          const remaining = Array.from(activeDownloadsMap.values()).pop() || null;
          activeDownload = remaining;
        }
      }, 300);
    }
    sendResponse({ status: 'cancelled' });
  } else if (message.type === 'GET_ALL_OFFSCREEN') {
    sendResponse({ states: Array.from(activeDownloadsMap.values()) });
  }
  return true;
});
