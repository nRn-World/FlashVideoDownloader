// Flash Video Downloader - Content Script (on-demand injection via activeTab + scripting)
// Scans DOM for openly accessible media on the active tab only.

(() => {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
  if (globalThis.__FVD_CONTENT_LOADED__) return;
  globalThis.__FVD_CONTENT_LOADED__ = true;

  if (typeof fvdIsBlockedUrl === 'function' && fvdIsBlockedUrl(window.location.href)) {
    return;
  }

  function formatTimeText(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  function isVisibleMediaElement(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;
    return true;
  }

  function collectVisibleVideos() {
    const videos = [...document.querySelectorAll('video')].filter(isVisibleMediaElement);
    videos.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    });
    return videos;
  }

  function scanDOM() {
    if (!chrome.runtime || !chrome.runtime.id) {
      return { items: [], visibleVideoCount: 0, visibleUrls: [] };
    }

    const discovered = new Set();
    const visibleUrls = new Set();
    const items = [];
    const visibleVideos = collectVisibleVideos();

    function addUrl(rawUrl, hint, durationSec) {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      let cleanUrl = rawUrl.trim();
      if (!cleanUrl || cleanUrl.startsWith('data:') || cleanUrl.startsWith('javascript:')) return;

      const isBlob = cleanUrl.startsWith('blob:');
      try {
        if (!isBlob) cleanUrl = new URL(cleanUrl, window.location.href).href;
      } catch (e) {
        return;
      }

      if (typeof fvdIsBlockedUrl === 'function' && fvdIsBlockedUrl(cleanUrl)) return;

      const allowHttp = cleanUrl.startsWith('http');
      const allowBlob = isBlob;
      if (!discovered.has(cleanUrl) && (allowHttp || allowBlob)) {
        discovered.add(cleanUrl);
        visibleUrls.add(cleanUrl);
        let filename;
        let ext;
        if (isBlob) {
          filename = (hint && hint.includes('.')) ? hint : 'video.mp4';
          ext = 'MP4';
          const hintLower = (hint || '').toLowerCase();
          if (hintLower.endsWith('.webm')) ext = 'WEBM';
          else if (hintLower.endsWith('.mkv')) ext = 'MKV';
        } else {
          filename = cleanUrl.split('/').pop().split('?')[0] || (hint || 'video.mp4');
          const rawExt = (cleanUrl.split('.').pop().split('?')[0] || 'MP4').toUpperCase();
          if (['M3U8', 'M3U', 'MPD', 'TS', 'M4S', 'FMP4', 'M2TS'].includes(rawExt)) ext = 'MP4';
          else ext = rawExt.length <= 5 ? rawExt : 'VIDEO';
          if (!filename.includes('.')) filename = filename + '.mp4';
          else if (/\.(m3u8|m3u|mpd|ts|m4s|fmp4)$/i.test(filename)) {
            filename = filename.replace(/\.(m3u8|m3u|mpd|ts|m4s|fmp4)$/i, '.mp4');
          }
        }
        if (isBlob && !filename.toLowerCase().endsWith('.mp4')) {
          filename = filename.replace(/\.[a-z0-9]+$/i, '') + '.mp4';
          if (!filename.includes('.')) filename += '.mp4';
        }
        items.push({
          url: cleanUrl,
          filename: decodeURIComponent(filename),
          format: ext,
          duration: formatTimeText(durationSec)
        });
      }
    }

    try {
      visibleVideos.forEach(el => {
        const dur = el.duration && !isNaN(el.duration) && isFinite(el.duration) ? el.duration : 0;
        const hintName = el.getAttribute('data-filename') || el.title || document.title || 'video.mp4';
        if (el.src) addUrl(el.src, hintName, dur);
        if (el.currentSrc) addUrl(el.currentSrc, hintName, dur);
        el.querySelectorAll('source').forEach(src => {
          if (src.src) addUrl(src.src, hintName, dur);
        });
      });
    } catch (err) {}

    return {
      items,
      visibleVideoCount: visibleVideos.length,
      visibleUrls: [...visibleUrls]
    };
  }

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req && req.type === 'SCAN_PAGE') {
      sendResponse(scanDOM());
      return true;
    }
    if (req && req.type === 'FETCH_BLOB') {
      (async () => {
        try {
          if (!req.url || !req.url.startsWith('blob:')) {
            sendResponse({ error: 'Invalid blob URL' });
            return;
          }
          const res = await fetch(req.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          if (!buffer || buffer.byteLength === 0) throw new Error('Empty blob');
          sendResponse({ buffer });
        } catch (e) {
          sendResponse({ error: e && e.message ? e.message : 'Blob fetch failed' });
        }
      })();
      return true;
    }
    return true;
  });
})();
