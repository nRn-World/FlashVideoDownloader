// Flash Video Downloader - Offscreen HLS Download Engine (Full Pipeline)
// This runs in a real DOM context with URL.createObjectURL, Blob, and anchor downloads.

let activeDownload = null;

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

async function runHlsDownload(downloadId, playlistUrl, filename) {
  activeDownload = {
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

  reportProgress();

  try {
    const startTime = Date.now();

    // 1. Fetch master playlist
    const res = await fetch(playlistUrl);
    if (!res.ok) throw new Error('Could not fetch M3U8 playlist.');
    let text = await res.text();
    let targetPlaylistUrl = playlistUrl;

    // Handle master playlist (pick highest bandwidth)
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
          segments.push({ url: fullUrl, duration: currentExtinfDuration });
          totalSec += currentExtinfDuration;
          currentExtinfDuration = 0;
        } catch (e) {}
      }
    }

    if (segments.length === 0) {
      throw new Error('No video segments found in playlist.');
    }

    const total = segments.length;
    activeDownload.total = total;
    activeDownload.totalDurationSec = Math.round(totalSec);
    activeDownload.totalDurationFormatted = formatDurationSeconds(Math.round(totalSec));
    reportProgress();

    // 3. Download all segments with concurrency
    const buffers = new Array(total);
    let completed = 0;
    let currentIndex = 0;
    let totalLoadedBytes = 0;
    let currentLoadedSec = 0;
    const concurrency = Math.min(20, total);

    async function worker() {
      while (currentIndex < total) {
        if (activeDownload.status === 'cancelled') return;
        const idx = currentIndex++;
        const seg = segments[idx];
        let attempts = 3;

        while (attempts > 0) {
          try {
            const segRes = await fetch(seg.url, { cache: 'no-store' });
            if (!segRes.ok) throw new Error(`Segment ${idx} fetch failed`);
            const ab = await segRes.arrayBuffer();
            buffers[idx] = ab;
            completed++;
            totalLoadedBytes += ab.byteLength;
            currentLoadedSec += seg.duration;

            activeDownload.completed = completed;
            activeDownload.percent = Math.round((completed / total) * 100);
            activeDownload.downloadedDurationSec = Math.round(currentLoadedSec);
            activeDownload.downloadedDurationFormatted = formatDurationSeconds(Math.round(currentLoadedSec));
            activeDownload.totalBytes = totalLoadedBytes;

            if (completed % 10 === 0 || completed === total) {
              reportProgress();
            }
            break;
          } catch (e) {
            attempts--;
            if (attempts === 0) throw e;
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (activeDownload.status === 'cancelled') return;

    // 4. Merge all segments into one Blob
    activeDownload.status = 'merging';
    activeDownload.percent = 100;
    reportProgress();

    const mergedBlob = new Blob(buffers, { type: 'video/mp4' });
    activeDownload.totalBytes = mergedBlob.size;

    console.log(`[FVD Offscreen] Merged blob size: ${mergedBlob.size} bytes (${formatBytes(mergedBlob.size)})`);

    // 5. Save to disk via DOM anchor + createObjectURL (no size limit!)
    const blobUrl = URL.createObjectURL(mergedBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoke after generous delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);

    // 6. Done
    activeDownload.status = 'completed';
    activeDownload.percent = 100;
    reportProgress();

    // Notify background to save history
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD_COMPLETE',
      downloadId: downloadId,
      filename: filename,
      url: playlistUrl,
      size: formatBytes(mergedBlob.size),
      duration: activeDownload.totalDurationFormatted || 'Stream'
    });

  } catch (err) {
    console.error('[FVD Offscreen] Download error:', err);
    activeDownload.status = 'error';
    activeDownload.error = err.message || 'Download failed.';
    reportProgress();
  }
}

function reportProgress() {
  if (!activeDownload) return;
  chrome.runtime.sendMessage({
    type: 'OFFSCREEN_PROGRESS',
    state: { ...activeDownload }
  }).catch(() => {});
}

// Listen for commands from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_HLS') {
    const { downloadId, url, filename } = message;
    runHlsDownload(downloadId, url, filename);
    sendResponse({ status: 'started' });
  }
  else if (message.type === 'GET_OFFSCREEN_STATUS') {
    sendResponse({ state: activeDownload });
  }
  return true;
});
