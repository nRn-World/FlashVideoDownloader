// Flash Video Downloader - Offscreen HLS Download Engine (Full Pipeline)
// This runs in a real DOM context with URL.createObjectURL, Blob, and anchor downloads.

const activeDownloadsMap = new Map();
let activeDownload = null; // last active (compat)

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

async function waitIfPaused(dl) {
  while (dl && dl.status === 'paused') {
    await new Promise(r => setTimeout(r, 200));
    if (dl.status === 'cancelled') return false;
  }
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

  try {
    // 1. Fetch master playlist (respect pause)
    if (!await waitIfPaused(dl)) return;
    const res = await fetch(playlistUrl);
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
        const subRes = await fetch(targetPlaylistUrl);
        if (!subRes.ok) throw new Error('Could not load sub-playlist.');
        if (dl.status === 'cancelled') return;
        text = await subRes.text();
      }
    }

    // 2. Parse segments
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
          segments.push({ url: fullUrl, duration: currentExtinfDuration });
          totalSec += currentExtinfDuration;
          currentExtinfDuration = 0;
        } catch (e) {}
      }
    }
    if (segments.length === 0) throw new Error('No video segments found in playlist.');

    const total = segments.length;
    dl.total = total;
    dl.totalDurationSec = Math.round(totalSec);
    dl.totalDurationFormatted = formatDurationSeconds(Math.round(totalSec));
    reportProgressFor(dl);

    // 3. Download segments with concurrency + pause/cancel support
    const buffers = new Array(total);
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
        if (dl.status === 'cancelled') return;
        if (dl.status === 'paused') {
          if (!await waitIfPaused(dl)) return;
        }
        if (currentIndex >= total) return;
        const idx = currentIndex++;
        const seg = segments[idx];
        let attempts = 3;
        while (attempts > 0) {
          if (dl.status === 'cancelled') return;
          if (dl.status === 'paused') {
            if (!await waitIfPaused(dl)) return;
          }
          try {
            const segRes = await fetch(seg.url, { cache: 'no-store' });
            if (!segRes.ok) throw new Error(`Segment ${idx} fetch failed`);
            const ab = await segRes.arrayBuffer();
            if (dl.status === 'cancelled') return;
            buffers[idx] = ab;
            completed++;
            totalLoadedBytes += ab.byteLength;
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

    const mergedBlob = new Blob(buffers, { type: 'video/mp4' });
    dl.totalBytes = mergedBlob.size;

    console.log(`[FVD Offscreen] Merged blob size: ${mergedBlob.size} bytes (${formatBytes(mergedBlob.size)})`);

    const blobUrl = URL.createObjectURL(mergedBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);

    dl.status = 'completed';
    dl.percent = 100;
    reportProgressFor(dl);

    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD_COMPLETE',
      downloadId: downloadId,
      filename: filename,
      url: playlistUrl,
      size: formatBytes(mergedBlob.size),
      duration: dl.totalDurationFormatted || 'Stream'
    });

  } catch (err) {
    console.error('[FVD Offscreen] Download error:', err);
    if (dl.status === 'cancelled') return;
    dl.status = 'error';
    dl.error = err.message || 'Download failed.';
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
  try {
    if (!await waitIfPaused(dl)) return;
    const res = await fetch(fileUrl, { cache: 'no-store' });
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
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename; // behåll originaländelse (.avi/.mkv/.mp4 etc – redan normaliserad i popup/background)
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);

    dl.status = 'completed';
    dl.percent = 100;
    reportProgressFor(dl);
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD_COMPLETE',
      downloadId: downloadId,
      filename: a.download,
      url: fileUrl,
      size: formatBytes(mergedBlob.size),
      duration: dl.totalDurationFormatted || 'Video'
    });
  } catch (err) {
    if (fakeTimer) clearInterval(fakeTimer);
    console.error('[FVD Offscreen] Generic error:', err);
    if (dl.status === 'cancelled') return;
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
  } else if (message.type === 'GET_OFFSCREEN_STATUS') {
    sendResponse({ state: activeDownload });
  } else if (message.type === 'PAUSE_OFFSCREEN_HLS') {
    const dl = getDl(message.downloadId);
    if (dl && dl.status === 'downloading') {
      dl.status = 'paused';
      reportProgressFor(dl);
    }
    sendResponse({ status: 'ok' });
  } else if (message.type === 'RESUME_OFFSCREEN_HLS') {
    const dl = getDl(message.downloadId);
    if (dl && dl.status === 'paused') {
      dl.status = 'downloading';
      reportProgressFor(dl);
    }
    sendResponse({ status: 'ok' });
  } else if (message.type === 'CANCEL_OFFSCREEN_HLS') {
    const dl = getDl(message.downloadId);
    if (dl) {
      dl.status = 'cancelled';
      reportProgressFor(dl);
      setTimeout(() => {
        activeDownloadsMap.delete(message.downloadId);
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
