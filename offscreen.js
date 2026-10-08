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
    if (!chrome.storage || !chrome.storage.session) return;
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

// Behåll original container-typ via filändelse så att t.ex. .avi/.mkv/.flv inte
// sparas som video/mp4 (det gör att filen felaktas av spelare och system).
const CONTAINER_MIME_BY_EXT = {
  mp4: 'video/mp4', m4v: 'video/x-m4v', fmp4: 'video/mp4', m4s: 'video/iso.segment',
  webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime',
  flv: 'video/x-flv', f4v: 'video/x-f4v', wmv: 'video/x-ms-wmv', asf: 'video/x-ms-asf',
  '3gp': 'video/3gpp', '3g2': 'video/3gpp2', ts: 'video/mp2t', m2ts: 'video/mp2t',
  mts: 'video/mp2t', vob: 'video/mpeg', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  m2v: 'video/mpeg', divx: 'video/x-msvideo',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', wma: 'audio/x-ms-wma'
};

function mimeForContainer(filename) {
  const lower = String(filename || '').toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'video/mp4';
  return CONTAINER_MIME_BY_EXT[lower.slice(dot + 1)] || 'video/mp4';
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

function buildRefererCandidates(resourceUrl, pageReferer) {
  const list = [];
  const add = (r) => {
    if (!r || typeof r !== 'string') return;
    const trimmed = r.trim();
    if (!trimmed || list.includes(trimmed)) return;
    list.push(trimmed);
  };
  try {
    if (pageReferer) {
      add(pageReferer);
      add(new URL(pageReferer).origin + '/');
    }
  } catch (e) {}
  try {
    const u = new URL(resourceUrl);
    add(u.origin + '/');
  } catch (e) {}
  // Last resort: no Referer (some CDNs reject forged ones)
  add('');
  return list;
}

/** Fetch with page/CDN Referer fallbacks — critical for embed CDNs (vidsrc etc.) */
async function fetchWithReferer(url, options = {}) {
  const pageReferer = options.pageReferer || null;
  const fetchOpts = { ...options };
  delete fetchOpts.pageReferer;

  const referers = buildRefererCandidates(url, pageReferer);
  let lastRes = null;
  let lastErr = null;

  for (const referer of referers) {
    try {
      const headers = new Headers(fetchOpts.headers || {});
      if (referer) {
        headers.set('Referer', referer);
        try { headers.set('Origin', new URL(referer).origin); } catch (e) {}
      } else {
        headers.delete('Referer');
        headers.delete('Origin');
      }
      const res = await fetch(url, { ...fetchOpts, headers });
      lastRes = res;
      if (res.ok) return res;
      // Permanent miss — no point trying other referers
      if (res.status === 404 || res.status === 410) return res;
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  if (lastRes) return lastRes;
  throw lastErr || new Error('Fetch failed');
}

function sleepMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function deliverDownload(blobUrl, filename) {
  const safeName = (filename || 'video.mp4').replace(/[/\\?%*:|"<>]/g, '_').replace(/^\/+/, '');

  let useCustomDir = false;
  let askSave = false;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get([
        'useDefaultDownloadFolder',
        'useCustomDirectory',
        'askSaveEachTime'
      ]);
      useCustomDir = data.useDefaultDownloadFolder === true && data.useCustomDirectory === true;
      askSave = data.askSaveEachTime === true && !useCustomDir;
    }
  } catch (e) {
    console.warn('[FVD Offscreen] storage read failed:', e && e.message ? e.message : e);
  }

  if (useCustomDir && typeof fvdWriteBlobToDirectory === 'function') {
    try {
      const blob = await fetch(blobUrl).then(r => r.blob());
      const ok = await fvdWriteBlobToDirectory(blob, safeName);
      if (ok) return;
    } catch (e) {
      console.warn('[FVD Offscreen] custom folder write failed:', e && e.message ? e.message : e);
    }
  }

  // Download from THIS document — blob: URLs are invalid in the service worker
  if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
    await chrome.downloads.download({
      url: blobUrl,
      filename: safeName,
      saveAs: askSave
    });
    return;
  }

  const res = await chrome.runtime.sendMessage({
    type: 'SAVE_DOWNLOAD_FILE',
    blobUrl,
    filename: safeName
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

// === DRM detection ===
// An encrypted stream can never become a playable file: the decryption key lives
// on the service's licence server, not in the stream. Downloading one only wastes
// the user's time and bandwidth, so we detect it and stop instead of saving a
// broken file. This is detection only - we do not and cannot decrypt anything.
const DRM_PROTECTED_ERROR = 'This stream is encrypted (DRM-protected), so it cannot be downloaded. The file would play as black or distorted picture with no sound. Please find a version of this video that is not encrypted.';

// DASH schemeIdUri values that mean the payload is encrypted
const DRM_SCHEME_URIS = [
  'urn:mpeg:dash:mp4protection:2011',              // Common Encryption (cenc / cbcs)
  'urn:mpeg:dash:mp4protection:2012',
  'urn:mpeg:dash:2649:2013',                       // PlayReady
  'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed', // Widevine
  'urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95', // PlayReady
  'urn:uuid:94ce86fb-07ff-4f43-adb8-93d2fa968ca2', // Widevine
  'urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4f', // Widevine
  'urn:uuid:d08a4f18-10f3-4a50-bbb4-cfd0d5b5fcc0', // PlayReady
  'urn:uuid:e2719d58-a985-b3c9-781a-b030af78d30e', // ClearKey - still needs a key we do not have
  'urn:mpeg:dash:13818:1:ca_descriptor:2011',
  'com.apple.streamingkeydelivery'                 // FairPlay
];

function isDrmScheme(schemeIdUri) {
  const s = String(schemeIdUri || '').trim().toLowerCase();
  if (!s) return false;
  return DRM_SCHEME_URIS.some(k => s === k || s.startsWith(k));
}

function directContentProtection(el) {
  const out = [];
  if (!el || !el.childNodes) return out;
  for (const child of el.childNodes) {
    if (child.nodeType === 1 && child.nodeName && child.nodeName.toLowerCase() === 'contentprotection') out.push(child);
  }
  return out;
}

// ContentProtection is inherited down the tree:
// MPD > Period > AdaptationSet > Representation
function isRepresentationEncrypted(rep) {
  let node = rep;
  while (node && node.nodeType === 1) {
    if ((node.nodeName || '').toLowerCase() === 'mpd') return false;
    for (const cp of directContentProtection(node)) {
      if (isDrmScheme(cp.getAttribute('schemeIdUri'))) return true;
    }
    node = node.parentElement;
  }
  return false;
}

// Detect an encrypted fragmented-MP4 stream from the bytes we downloaded.
// Init segments declare it with 'encv' (encrypted sample entry) plus 'cenc' /
// 'tenc'; media fragments carry 'senc' / 'saiz' instead, which is all we have to
// go on for HLS, where no init segment is fetched. None of these 4CCs ever occur
// in a clear stream, so this cannot misfire on unencrypted content.
const FMP4_ENCRYPTION_MARKERS = [
  [0x65, 0x6e, 0x63, 0x76], // encv  encrypted sample entry (init)
  [0x63, 0x65, 0x6e, 0x63], // cenc  Common Encryption scheme (init)
  [0x74, 0x65, 0x6e, 0x63], // tenc  track encryption box (init)
  [0x73, 0x65, 0x6e, 0x63], // senc  sample encryption (fragment)
  [0x73, 0x61, 0x69, 0x7a], // saiz  sample aux info sizes (fragment)
  [0x70, 0x73, 0x73, 0x68]  // pssh  protection system header (DRM)
];

function isEncryptedFmp4(buffer) {
  if (!buffer) return false;
  let bytes;
  if (buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
  else if (ArrayBuffer.isView(buffer)) bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  else return false;
  const limit = Math.min(bytes.length, 65536);
  outer:
  for (let i = 0; i + 4 <= limit; i++) {
    for (const m of FMP4_ENCRYPTION_MARKERS) {
      if (bytes[i] === m[0] && bytes[i + 1] === m[1] && bytes[i + 2] === m[2] && bytes[i + 3] === m[3]) return true;
    }
  }
  return false;
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
    throw new Error(`Encryption method ${methodMatch[1]} is not supported yet`);
  }
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (!uriMatch) return null;
  const keyUrl = new URL(uriMatch[1], targetPlaylistUrl).href;
  let iv = null;
  const ivMatch = line.match(/IV=0x([0-9a-fA-F]+)/i);
  if (ivMatch) iv = hexToBytes(ivMatch[1]);
  return { keyUrl, iv };
}

async function fetchAesKeyBytes(keyUrl, pageReferer) {
  const res = await fetchWithReferer(keyUrl, { cache: 'no-store', pageReferer });
  if (!res.ok) throw new Error('Could not fetch AES-128 encryption key');
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

async function resolveSegmentBuffer(rawBuffer, seg, keyCache, pageReferer) {
  if (!seg.keyInfo) return rawBuffer;
  if (!keyCache.has(seg.keyInfo.keyUrl)) {
    keyCache.set(seg.keyInfo.keyUrl, await fetchAesKeyBytes(seg.keyInfo.keyUrl, pageReferer));
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

async function runHlsDownload(downloadId, playlistUrl, filename, pageReferer) {
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
  const refererOpt = { pageReferer: pageReferer || null };

  try {
    // 1. Fetch master playlist (respect pause)
    if (!await waitIfPaused(dl)) return;
    const res = await fetchWithReferer(playlistUrl, { signal: fetchSignal, ...refererOpt });
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
        const subRes = await fetchWithReferer(targetPlaylistUrl, { signal: fetchSignal, ...refererOpt });
        if (!subRes.ok) throw new Error('Could not load sub-playlist.');
        if (dl.status === 'cancelled') return;
        text = await subRes.text();
      }
    }

    // 2. Parse segments (supports AES-128 keys + live/VOD detection)
    const { segments, totalSec, isLive } = parseHlsPlaylist(text, targetPlaylistUrl);
    if (segments.length === 0) throw new Error('No video segments found in playlist.');
    if (isLive) throw new Error('Live streams are not supported. Try a finished VOD recording instead.');

    const total = segments.length;
    dl.total = total;
    dl.totalDurationSec = Math.round(totalSec);
    dl.totalDurationFormatted = formatDurationSeconds(Math.round(totalSec));
    reportProgressFor(dl);

    // 3. Download segments — moderate concurrency + repair pass (CDN-friendly)
    const buffers = new Array(total);
    const keyCache = new Map();
    let completed = 0;
    let totalLoadedBytes = 0;
    let currentLoadedSec = 0;
    // High concurrency triggers rate-limits on embed CDNs; keep it low
    const concurrency = Math.min(4, total);

    let lastReportAt = 0;
    let lastReportedPercent = -1;
    let pendingReportTimer = null;

    function scheduleProgressReport(force) {
      if (dl.status === 'error' || dl.status === 'cancelled') return;
      const now = Date.now();
      const percentChanged = dl.percent !== lastReportedPercent;
      if (percentChanged) {
        lastReportAt = now;
        lastReportedPercent = dl.percent;
        if (pendingReportTimer) { clearTimeout(pendingReportTimer); pendingReportTimer = null; }
        reportProgressFor(dl);
        return;
      }
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

    function markSegmentDone(idx, ab, seg) {
      if (buffers[idx]) return;
      buffers[idx] = ab;
      completed++;
      totalLoadedBytes += (ab.byteLength || ab.length || 0);
      currentLoadedSec += seg.duration || 0;
      dl.completed = completed;
      dl.percent = Math.min(100, Math.round((completed / total) * 100));
      dl.downloadedDurationSec = Math.round(currentLoadedSec);
      dl.downloadedDurationFormatted = formatDurationSeconds(Math.round(currentLoadedSec));
      dl.totalBytes = totalLoadedBytes;
      scheduleProgressReport(false);
    }

    async function fetchOneSegment(idx, maxAttempts) {
      const seg = segments[idx];
      let attempts = maxAttempts;
      let lastError = null;
      while (attempts > 0) {
        await syncDownloadControlFromSession(dl);
        if (dl.status === 'cancelled') return false;
        if (dl.status === 'paused') {
          if (!await waitIfPaused(dl)) return false;
          attempts = maxAttempts;
        }
        try {
          const segRes = await fetchWithReferer(seg.url, {
            cache: 'no-store',
            signal: fetchSignal,
            ...refererOpt
          });
          if (!segRes.ok) throw new Error(`Segment ${idx} fetch failed (HTTP ${segRes.status})`);
          let ab = await segRes.arrayBuffer();
          if (seg.keyInfo) {
            ab = await resolveSegmentBuffer(ab, seg, keyCache, pageReferer);
          }
          if (dl.status === 'cancelled') return false;
          markSegmentDone(idx, ab, seg);
          return true;
        } catch (e) {
          if (dl.status === 'cancelled') return false;
          if (e && e.name === 'AbortError') return false;
          lastError = e;
          attempts--;
          if (dl.status === 'paused') continue;
          if (attempts > 0) {
            const backoff = 400 * (maxAttempts - attempts) + Math.floor(Math.random() * 250);
            await sleepMs(backoff);
          }
        }
      }
      console.warn('[FVD Offscreen] Segment failed after retries:', idx, lastError && lastError.message);
      return false;
    }

    async function runPool(indices, poolSize, maxAttempts) {
      let cursor = 0;
      async function worker() {
        while (true) {
          if (dl.status === 'cancelled') return;
          const my = cursor++;
          if (my >= indices.length) return;
          const idx = indices[my];
          if (buffers[idx]) continue;
          await fetchOneSegment(idx, maxAttempts);
        }
      }
      const n = Math.min(poolSize, indices.length) || 1;
      await Promise.all(Array.from({ length: n }, () => worker()));
    }

    // First pass
    const allIdx = Array.from({ length: total }, (_, i) => i);
    await runPool(allIdx, concurrency, 5);
    if (dl.status === 'cancelled') {
      activeDownloadsMap.delete(downloadId);
      cleanupDownloadAbort(downloadId);
      if (activeDownload && activeDownload.id === downloadId) activeDownload = null;
      return;
    }

    // Repair pass — missing segments, serial / low concurrency
    let missing = allIdx.filter(i => !buffers[i]);
    if (missing.length > 0 && dl.status !== 'cancelled') {
      console.warn(`[FVD Offscreen] Repairing ${missing.length} missing segment(s)`);
      await sleepMs(600);
      await runPool(missing, 1, 8);
      missing = allIdx.filter(i => !buffers[i]);
    }
    if (missing.length > 0 && dl.status !== 'cancelled') {
      await sleepMs(1200);
      await runPool(missing, 1, 6);
      missing = allIdx.filter(i => !buffers[i]);
    }

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
    if (dl.status === 'paused') {
      if (!await waitIfPaused(dl)) return;
    }
    if (dl.status === 'cancelled') return;

    missing = allIdx.filter(i => !buffers[i]);
    if (missing.length > 0) {
      throw new Error(`Segment ${missing[0]} fetch failed (${missing.length} missing)`);
    }

    // For fMP4 playlists buffers[0] is the first fragment. If it carries CENC
    // markers, remuxing would only produce an unplayable file.
    if (!segments.some(s => /\.ts(\?|#|$)/i.test(s.url)) && isEncryptedFmp4(buffers[0])) {
      throw new Error(DRM_PROTECTED_ERROR);
    }

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
    if (dl.status === 'cancelled') {
      activeDownloadsMap.delete(downloadId);
      if (activeDownload && activeDownload.id === downloadId) activeDownload = null;
      return;
    }
    if (err && err.name === 'AbortError' && dl.status !== 'error') {
      activeDownloadsMap.delete(downloadId);
      if (activeDownload && activeDownload.id === downloadId) activeDownload = null;
      return;
    }
    dl.status = 'error';
    dl.error = dl.error || (err && err.message) || 'Download failed.';
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
    const mergedBlob = new Blob([buffer], { type: mimeForContainer(filename) });
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
    dl.error = err.message || 'Blob save failed';
    reportProgressFor(dl);
  }
}

/** Basic DASH/MPD: SegmentTemplate ($Number$) or SegmentList → fMP4 concat */
function parseDashMpd(xmlText, mpdUrl) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid MPD playlist.');

  const baseEl = doc.querySelector('BaseURL');
  let baseUrl = mpdUrl;
  try {
    if (baseEl && baseEl.textContent) baseUrl = new URL(baseEl.textContent.trim(), mpdUrl).href;
  } catch (e) {}

  const reps = Array.from(doc.querySelectorAll('Representation'));
  let best = null;
  let bestBw = -1;
  let sawEncrypted = false;
  for (const rep of reps) {
    const mime = (rep.getAttribute('mimeType') || rep.parentElement?.getAttribute('mimeType') || '').toLowerCase();
    const contentType = (rep.parentElement?.getAttribute('contentType') || '').toLowerCase();
    const isVideo = mime.includes('video') || contentType === 'video' || (!mime && !contentType);
    if (!isVideo && mime.includes('audio')) continue;
    // Never pick an encrypted representation - the result could never be played
    if (isRepresentationEncrypted(rep)) {
      sawEncrypted = true;
      continue;
    }
    const bw = parseInt(rep.getAttribute('bandwidth') || '0', 10);
    if (bw >= bestBw) {
      bestBw = bw;
      best = rep;
    }
  }
  if (!best) {
    if (sawEncrypted) throw new Error(DRM_PROTECTED_ERROR);
    throw new Error('No video representation found in MPD.');
  }

  const adapt = best.parentElement;
  const segmentTemplate =
    best.querySelector('SegmentTemplate') ||
    (adapt && adapt.querySelector('SegmentTemplate')) ||
    doc.querySelector('SegmentTemplate');
  const segmentList =
    best.querySelector('SegmentList') ||
    (adapt && adapt.querySelector('SegmentList'));

  const urls = [];
  const pushUrl = (u) => {
    try { urls.push(new URL(u, baseUrl).href); } catch (e) {}
  };

  if (segmentTemplate) {
    const media = segmentTemplate.getAttribute('media') || '';
    const init = segmentTemplate.getAttribute('initialization') || '';
    const startNumber = parseInt(segmentTemplate.getAttribute('startNumber') || '1', 10);
    const timescale = parseInt(segmentTemplate.getAttribute('timescale') || '1', 10) || 1;
    const duration = parseInt(segmentTemplate.getAttribute('duration') || '0', 10);
    const repId = best.getAttribute('id') || '';
    const bandwidth = best.getAttribute('bandwidth') || '';

    const fill = (tpl, n) => tpl
      .replace(/\$RepresentationID\$/g, repId)
      .replace(/\$Bandwidth\$/g, bandwidth)
      .replace(/\$Number(%0(\d+)d)?\$/g, (_, _p, pad) => {
        const num = String(n);
        return pad ? num.padStart(parseInt(pad, 10), '0') : num;
      })
      .replace(/\$Time\$/g, String((n - startNumber) * duration));

    if (init) pushUrl(fill(init, startNumber));

    let count = 0;
    const timeline = segmentTemplate.querySelector('SegmentTimeline');
    if (timeline) {
      let n = startNumber;
      let t = 0;
      for (const s of timeline.querySelectorAll('S')) {
        const d = parseInt(s.getAttribute('d') || '0', 10);
        const r = parseInt(s.getAttribute('r') || '0', 10);
        const tAttr = s.getAttribute('t');
        if (tAttr != null) t = parseInt(tAttr, 10);
        const repeats = r + 1;
        for (let i = 0; i < repeats; i++) {
          const tpl = media.replace(/\$Time\$/g, String(t)).replace(/\$Number(%0(\d+)d)?\$/g, (_, _p, pad) => {
            const num = String(n);
            return pad ? num.padStart(parseInt(pad, 10), '0') : num;
          }).replace(/\$RepresentationID\$/g, repId).replace(/\$Bandwidth\$/g, bandwidth);
          pushUrl(tpl);
          t += d;
          n++;
          count++;
          if (count > 20000) break;
        }
      }
    } else if (duration > 0) {
      // Estimate from Period/@duration (PT#H#M#S) or cap
      let periodSec = 0;
      const period = doc.querySelector('Period');
      const durAttr = (period && period.getAttribute('duration')) || doc.documentElement.getAttribute('mediaPresentationDuration') || '';
      const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(durAttr);
      if (m) {
        periodSec = (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseFloat(m[3] || '0');
      }
      const segDurSec = duration / timescale;
      const est = periodSec > 0 ? Math.ceil(periodSec / segDurSec) : 300;
      const maxSeg = Math.min(Math.max(est, 1), 20000);
      for (let n = startNumber; n < startNumber + maxSeg; n++) {
        pushUrl(fill(media, n));
      }
    } else {
      throw new Error('DASH SegmentTemplate without duration/timeline is not supported.');
    }
  } else if (segmentList) {
    const init = segmentList.querySelector('Initialization');
    if (init && init.getAttribute('sourceURL')) pushUrl(init.getAttribute('sourceURL'));
    for (const seg of segmentList.querySelectorAll('SegmentURL')) {
      const u = seg.getAttribute('media') || seg.getAttribute('sourceURL');
      if (u) pushUrl(u);
    }
  } else {
    // Single BaseURL file
    const repBase = best.querySelector('BaseURL');
    if (repBase && repBase.textContent) {
      pushUrl(repBase.textContent.trim());
    } else {
      throw new Error('Unsupported DASH structure (need SegmentTemplate or SegmentList).');
    }
  }

  if (urls.length === 0) throw new Error('No DASH segments found.');
  return urls;
}

async function runDashDownload(downloadId, mpdUrl, filename, pageReferer) {
  const dl = {
    id: downloadId,
    url: mpdUrl,
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
  const refererOpt = { pageReferer: pageReferer || null };

  try {
    if (!await waitIfPaused(dl)) return;
    const res = await fetchWithReferer(mpdUrl, { signal: fetchSignal, ...refererOpt });
    if (!res.ok) throw new Error('Could not fetch MPD playlist.');
    const xmlText = await res.text();
    if (dl.status === 'cancelled') return;

    const segmentUrls = parseDashMpd(xmlText, mpdUrl);
    const total = segmentUrls.length;
    dl.total = total;
    reportProgressFor(dl);

    // Probe the init segment before pulling the rest of the stream. It is only a
    // few KB, and it tells us straight away whether the payload is encrypted -
    // otherwise a 2 hour stream would download gigabytes of unusable video before
    // anything realises the result cannot be played. If the probe itself fails we
    // carry on and let the post-download check catch it.
    if (total > 1) {
      let probe = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetchWithReferer(segmentUrls[0], { cache: 'no-store', signal: fetchSignal, ...refererOpt });
          if (r.ok) { probe = await r.arrayBuffer(); break; }
        } catch (e) {
          if (e && e.name === 'AbortError') throw e;
        }
        if (attempt < 2) await sleepMs(300 * (attempt + 1));
      }
      if (isEncryptedFmp4(probe)) throw new Error(DRM_PROTECTED_ERROR);
    }

    const buffers = new Array(total);
    let completed = 0;
    let totalLoadedBytes = 0;
    let cursor = 0;
    const concurrency = Math.min(4, total);

    async function fetchSeg(idx, attempts) {
      let left = attempts;
      while (left > 0) {
        await syncDownloadControlFromSession(dl);
        if (dl.status === 'cancelled') return false;
        if (dl.status === 'paused') {
          if (!await waitIfPaused(dl)) return false;
          left = attempts;
        }
        try {
          const r = await fetchWithReferer(segmentUrls[idx], {
            cache: 'no-store', signal: fetchSignal, ...refererOpt
          });
          if (!r.ok) throw new Error(`DASH segment ${idx} failed (HTTP ${r.status})`);
          const ab = await r.arrayBuffer();
          if (dl.status === 'cancelled') return false;
          if (!buffers[idx]) {
            buffers[idx] = ab;
            completed++;
            totalLoadedBytes += ab.byteLength || 0;
            dl.completed = completed;
            dl.percent = Math.min(100, Math.round((completed / total) * 100));
            dl.totalBytes = totalLoadedBytes;
            reportProgressFor(dl);
          }
          return true;
        } catch (e) {
          if (e && e.name === 'AbortError') return false;
          left--;
          if (left > 0) await sleepMs(400 * (attempts - left) + 100);
        }
      }
      return false;
    }

    async function worker() {
      while (true) {
        if (dl.status === 'cancelled') return;
        const idx = cursor++;
        if (idx >= total) return;
        await fetchSeg(idx, 5);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    let missing = [];
    for (let i = 0; i < total; i++) if (!buffers[i]) missing.push(i);
    if (missing.length && dl.status !== 'cancelled') {
      for (const idx of missing) {
        await fetchSeg(idx, 8);
      }
    }
    if (dl.status === 'cancelled') {
      activeDownloadsMap.delete(downloadId);
      cleanupDownloadAbort(downloadId);
      return;
    }
    missing = [];
    for (let i = 0; i < total; i++) if (!buffers[i]) missing.push(i);
    if (missing.length) throw new Error(`DASH segment ${missing[0]} fetch failed (${missing.length} missing)`);

    // The MPD may not declare ContentProtection even when the payload is
    // encrypted, so check the init segment we actually received (buffers[0])
    if (isEncryptedFmp4(buffers[0])) throw new Error(DRM_PROTECTED_ERROR);

    dl.status = 'merging';
    dl.percent = 100;
    reportProgressFor(dl);

    const mergedBlob = new Blob(buffers.filter(Boolean), { type: 'video/mp4' });
    dl.totalBytes = mergedBlob.size;
    const blobUrl = URL.createObjectURL(mergedBlob);
    const savedFilename = filename.toLowerCase().endsWith('.mp4') ? filename : filename.replace(/\.\w+$/, '') + '.mp4';
    try {
      await deliverDownload(blobUrl, savedFilename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    }

    dl.status = 'completed';
    reportProgressFor(dl);
    cleanupDownloadAbort(downloadId);
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD_COMPLETE',
      downloadId,
      filename: savedFilename,
      url: mpdUrl,
      size: formatBytes(mergedBlob.size),
      duration: 'DASH'
    });
  } catch (err) {
    console.error('[FVD Offscreen] DASH error:', err);
    cleanupDownloadAbort(downloadId);
    if (dl.status === 'cancelled' || (err && err.name === 'AbortError')) {
      activeDownloadsMap.delete(downloadId);
      return;
    }
    dl.status = 'error';
    dl.error = err && err.message ? err.message : 'DASH download failed.';
    reportProgressFor(dl);
  }
}

async function runGenericDownload(downloadId, fileUrl, filename, pageReferer) {
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
    const res = await fetchWithReferer(fileUrl, {
      cache: 'no-store',
      signal: fetchSignal,
      pageReferer: pageReferer || null
    });
    if (!res.ok) throw new Error(`Could not fetch file (HTTP ${res.status})`);
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
    const mergedBlob = new Blob(blobParts, { type: mimeForContainer(filename) });
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
    dl.error = err.message || 'Download failed';
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
    const { downloadId, url, filename, pageReferer } = message;
    runHlsDownload(downloadId, url, filename, pageReferer || null);
    sendResponse({ status: 'started' });
  } else if (message.type === 'START_OFFSCREEN_DASH') {
    const { downloadId, url, filename, pageReferer } = message;
    runDashDownload(downloadId, url, filename, pageReferer || null);
    sendResponse({ status: 'started' });
// ============================================================
// PARALLEL CHUNK DOWNLOADER
// Splits the file into N equal byte-ranges and fetches them
// simultaneously. All chunks are concatenated in order into a
// single Blob so the user always gets one complete file.
//
// threads=1  → Normal speed  (single connection, same as generic)
// threads=4  → Fast (Free + sponsor click)
// threads=8  → Pro (fastest, no sponsor)
// ============================================================
async function runChunkedDownload(downloadId, fileUrl, filename, pageReferer, threads) {
  const numThreads = Math.max(1, Math.min(threads || 1, 16));

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

  const fetchSignal = getAbortSignal(downloadId);

  try {
    // ── Step 1: HEAD request to probe file size & Range support ──
    let contentLength = 0;
    let supportsRanges = false;

    try {
      const headRes = await fetchWithReferer(fileUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: fetchSignal,
        pageReferer: pageReferer || null
      });
      contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
      const acceptRanges = headRes.headers.get('accept-ranges') || '';
      supportsRanges = acceptRanges.toLowerCase() === 'bytes' && contentLength > 0;
    } catch (e) {
      // HEAD failed or no CORS — fall back to single stream
      supportsRanges = false;
    }

    // ── Step 2: If Range not supported or single thread, fall back to stream ──
    if (!supportsRanges || numThreads === 1) {
      console.log(`[FVD Chunked] Range not supported or threads=1 → single stream`);
      // Reuse runGenericDownload directly
      activeDownloadsMap.delete(downloadId);
      await runGenericDownload(downloadId, fileUrl, filename, pageReferer);
      return;
    }

    console.log(`[FVD Chunked] Splitting ${contentLength} bytes into ${numThreads} parallel chunks`);

    // ── Step 3: Split file into N byte ranges ──
    const chunkSize = Math.ceil(contentLength / numThreads);
    const ranges = [];
    for (let i = 0; i < numThreads; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, contentLength - 1);
      ranges.push({ start, end, index: i });
    }

    // ── Step 4: Fetch all chunks in parallel ──
    const chunkBuffers = new Array(numThreads).fill(null);
    let bytesReceived = 0;

    const fetchChunk = async ({ start, end, index }) => {
      const chunkRes = await fetchWithReferer(fileUrl, {
        cache: 'no-store',
        signal: fetchSignal,
        pageReferer: pageReferer || null,
        headers: { 'Range': `bytes=${start}-${end}` }
      });
      if (!chunkRes.ok && chunkRes.status !== 206) {
        throw new Error(`Chunk ${index} failed (HTTP ${chunkRes.status})`);
      }

      const reader = chunkRes.body ? chunkRes.body.getReader() : null;
      const parts = [];
      if (reader) {
        while (true) {
          if (dl.status === 'cancelled') { try { await reader.cancel(); } catch(e){} return; }
          if (dl.status === 'paused') { if (!await waitIfPaused(dl)) return; }
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            parts.push(value);
            bytesReceived += value.byteLength;
            dl.totalBytes = bytesReceived;
            dl.percent = Math.min(99, Math.round((bytesReceived / contentLength) * 100));
            reportProgressFor(dl);
          }
        }
      } else {
        const ab = await chunkRes.arrayBuffer();
        parts.push(new Uint8Array(ab));
        bytesReceived += ab.byteLength;
        dl.totalBytes = bytesReceived;
        dl.percent = Math.min(99, Math.round((bytesReceived / contentLength) * 100));
        reportProgressFor(dl);
      }
      // Concatenate this chunk's parts into one Uint8Array
      const totalLen = parts.reduce((s, p) => s + p.byteLength, 0);
      const buf = new Uint8Array(totalLen);
      let offset = 0;
      for (const p of parts) {
        buf.set(p instanceof Uint8Array ? p : new Uint8Array(p), offset);
        offset += p.byteLength;
      }
      chunkBuffers[index] = buf;
    };

    await Promise.all(ranges.map(fetchChunk));

    if (dl.status === 'cancelled') return;

    // ── Step 5: Merge all chunks IN ORDER into a single Blob ──
    dl.status = 'merging';
    dl.percent = 100;
    reportProgressFor(dl);

    const mergedBlob = new Blob(chunkBuffers.filter(Boolean), { type: mimeForContainer(filename) });
    dl.totalBytes = mergedBlob.size;
    console.log(`[FVD Chunked] Merged ${numThreads} chunks → ${mergedBlob.size} bytes`);

    // ── Step 6: Deliver as single file download ──
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
    cleanupDownloadAbort(downloadId);
    console.error('[FVD Chunked] Error:', err);
    if (dl.status === 'cancelled' || err.name === 'AbortError') {
      activeDownloadsMap.delete(downloadId);
      return;
    }
    // Fallback: retry as single stream
    console.warn('[FVD Chunked] Falling back to single-stream download');
    activeDownloadsMap.delete(downloadId);
    await runGenericDownload(downloadId, fileUrl, filename, pageReferer);
  }
}

  } else if (message.type === 'START_OFFSCREEN_GENERIC') {
    const { downloadId, url, filename, pageReferer } = message;
    runGenericDownload(downloadId, url, filename, pageReferer || null);
    sendResponse({ status: 'started' });
  } else if (message.type === 'START_OFFSCREEN_CHUNKED') {
    const { downloadId, url, filename, pageReferer, threads } = message;
    runChunkedDownload(downloadId, url, filename, pageReferer || null, threads || 4);
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
