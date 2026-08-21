// Flash Video Downloader - Enhanced Content Script with Duration Metadata Detection

(() => {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    return;
  }

  const MEDIA_REGEX = /https?:\/\/[^\s"'<>]+\.(?:mp4|m4v|webm|flv|f4v|m3u8|ts|mov|avi|mkv|mp3|m4a|aac|wav|ogg)(?:\?[^\s"'<>]*)?/gi;

  function formatTime(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  function scanDOM() {
    if (!chrome.runtime || !chrome.runtime.id) return [];

    const discovered = new Set();
    const items = [];

    function addUrl(rawUrl, hint, durationSec) {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      let cleanUrl = rawUrl.trim();
      if (!cleanUrl || cleanUrl.startsWith('blob:') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('javascript:')) {
        return;
      }
      try {
        cleanUrl = new URL(cleanUrl, window.location.href).href;
      } catch (e) {
        return;
      }

      if (!discovered.has(cleanUrl) && cleanUrl.startsWith('http')) {
        discovered.add(cleanUrl);
        const filename = cleanUrl.split('/').pop().split('?')[0] || (hint || 'video.mp4');
        const ext = (cleanUrl.split('.').pop().split('?')[0] || 'MP4').toUpperCase();
        items.push({
          url: cleanUrl,
          filename: decodeURIComponent(filename),
          format: ext.length <= 5 ? ext : 'VIDEO',
          duration: formatTime(durationSec)
        });
      }
    }

    try {
      // 1. Skanna HTML5 media-element med duration
      document.querySelectorAll('video, audio').forEach(el => {
        const dur = el.duration && !isNaN(el.duration) && isFinite(el.duration) ? el.duration : 0;
        if (el.src) addUrl(el.src, '', dur);
        if (el.currentSrc) addUrl(el.currentSrc, '', dur);
        el.querySelectorAll('source').forEach(src => {
          if (src.src) addUrl(src.src, '', dur);
        });
      });

      // 2. Skanna länkar
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && /\.(mp4|m4v|webm|flv|m3u8|mov|mp3|m4a)(\?.*)?$/i.test(href)) {
          addUrl(href, a.textContent.trim(), 0);
        }
      });

      // 3. Skanna scripts och inbäddade data-attribut
      document.querySelectorAll('script, div, section, article').forEach(el => {
        try {
          if (el.attributes) {
            for (const attr of el.attributes) {
              if (attr.name.startsWith('data-') && typeof attr.value === 'string') {
                const matches = attr.value.match(MEDIA_REGEX);
                if (matches) matches.forEach(u => addUrl(u, '', 0));
              }
            }
          }

          if (el.tagName === 'SCRIPT' && el.textContent) {
            const matches = el.textContent.match(MEDIA_REGEX);
            if (matches) matches.forEach(u => addUrl(u, '', 0));
          }
        } catch (subErr) {}
      });

      if (items.length > 0 && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          type: 'FOUND_DOM_MEDIA',
          items: items
        }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    } catch (err) {}

    return items;
  }

  scanDOM();

  let debounceTimeout = null;
  const observer = new MutationObserver(() => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      if (chrome.runtime && chrome.runtime.id) {
        scanDOM();
      } else {
        observer.disconnect();
      }
    }, 1500);
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req && req.type === 'SCAN_PAGE') {
      const items = scanDOM();
      sendResponse({ items: items });
    }
    return true;
  });
})();
