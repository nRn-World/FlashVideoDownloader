// Flash Video Downloader - Page Hook (MAIN World)
// Runs in the page MAIN world – has direct access to window globals, player instances (Video.js, JWPlayer, etc.)
// and native network that isolated content scripts cannot see.
(function () {
  if (globalThis.__FVD_PAGE_HOOK__) return;
  globalThis.__FVD_PAGE_HOOK__ = true;

  function looksLikeMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('javascript:')) return false;
    const u = url.toLowerCase();
    if (/\.(m3u8|m3u|mpd)(?:\?|#|$|\/)/i.test(u)) return true;
    if (/\.(mp4|m4v|webm|mov|mkv|avi|flv|f4v|ogv|3gp|3g2|wmv|asf|vob|mts|m2ts|mpg|mpeg|ts)(?:\?|#|$|\/)/i.test(u)) {
      if (!/\/(thumbnails?|sprite|tr_\d+p|avatar|favicon|poster)(?:[\/_\-.?&=]|$)/i.test(u)) {
        return true;
      }
    }
    if (/\/hls\//i.test(u) && !/\.(ts|m4s)(?:\?|#|$)/i.test(u)) return true;
    if (/\/(vid2|get_file|video[_-]?file|contents\/videos?)\//i.test(u)) return true;
    return false;
  }

  function report(url, meta) {
    if (!looksLikeMediaUrl(url) && !(meta && meta.rawCipher)) return;
    try {
      globalThis.postMessage({
        source: 'FVD_PAGE_HOOK',
        type: 'MEDIA_URL',
        url: String(url),
        meta: meta || null
      }, '*');
    } catch (e) {}
  }

  function collectVideoJsSources(out) {
    try {
      const vjs = globalThis.videojs;
      if (!vjs) return;
      const players = [];
      if (typeof vjs.getAllPlayers === 'function') {
        const all = vjs.getAllPlayers();
        if (Array.isArray(all)) players.push(...all);
      } else if (vjs.players && typeof vjs.players === 'object') {
        players.push(...Object.values(vjs.players));
      }

      for (const p of players) {
        if (!p) continue;

        const addSource = (s, qualityHint, typeHint) => {
          if (!s || typeof s !== 'string') return;
          if (!looksLikeMediaUrl(s)) return;
          const isHls = /\.m3u8/i.test(s) || (typeHint && String(typeHint).toLowerCase().includes('mpegurl'));
          const q = qualityHint ? String(qualityHint) : '';
          if (isHls) {
            if (!out.hls.includes(s)) out.hls.push(s);
            report(s, { kind: 'hls', quality: 'HLS' });
          } else {
            if (!out.standard.some(item => item.url === s)) {
              out.standard.push({ url: s, quality: q });
            }
            report(s, { kind: 'standard', quality: q });
          }
        };

        if (typeof p.currentSources === 'function') {
          const srcs = p.currentSources();
          if (Array.isArray(srcs)) {
            for (const s of srcs) {
              if (s && (s.src || s.url)) addSource(s.src || s.url, s.label || s.res || s.size, s.type);
            }
          }
        }

        const opts = (typeof p.options === 'function' ? p.options() : p.options_) || {};
        if (Array.isArray(opts.sources)) {
          for (const s of opts.sources) {
            if (s && (s.src || s.url)) addSource(s.src || s.url, s.label || s.res || s.size, s.type);
          }
        }

        if (typeof p.currentSrc === 'function') {
          addSource(p.currentSrc(), '');
        }

        if (typeof p.src === 'function') {
          const s = p.src();
          if (typeof s === 'string') addSource(s, '');
          else if (Array.isArray(s)) {
            for (const item of s) {
              if (item && (item.src || item.url)) addSource(item.src || item.url, item.label || item.res, item.type);
            }
          }
        }

        try {
          const el = (typeof p.el === 'function' ? p.el() : p.el_) || null;
          if (el) {
            const v = el.querySelector ? el.querySelector('video') : null;
            if (v) {
              if (v.currentSrc) addSource(v.currentSrc, '');
              if (v.src) addSource(v.src, '');
              const sources = v.querySelectorAll ? v.querySelectorAll('source') : [];
              for (const sc of sources) {
                addSource(
                  sc.src || sc.getAttribute('src'),
                  sc.getAttribute('label') || sc.getAttribute('res') || sc.getAttribute('data-quality') || ''
                );
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  function collectJwPlayerSources(out) {
    try {
      if (typeof globalThis.jwplayer !== 'function') return;
      let i = 0;
      while (i < 10) {
        let player = null;
        try { player = globalThis.jwplayer(i++); } catch (e) { break; }
        if (!player || typeof player.getPlaylist !== 'function') break;
        const pl = player.getPlaylist();
        if (Array.isArray(pl)) {
          for (const item of pl) {
            if (!item) continue;
            if (item.file && looksLikeMediaUrl(item.file)) {
              out.standard.push({ url: item.file, quality: '' });
              report(item.file);
            }
            if (Array.isArray(item.sources)) {
              for (const s of item.sources) {
                if (s && s.file && looksLikeMediaUrl(s.file)) {
                  out.standard.push({ url: s.file, quality: s.label || '' });
                  report(s.file, { quality: s.label || '' });
                }
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  function collectDomMediaRaw(out) {
    try {
      const vids = document.querySelectorAll('video, audio');
      for (const v of vids) {
        if (v.currentSrc && looksLikeMediaUrl(v.currentSrc)) {
          out.standard.push({ url: v.currentSrc, quality: '' });
          report(v.currentSrc);
        }
        if (v.src && looksLikeMediaUrl(v.src)) {
          out.standard.push({ url: v.src, quality: '' });
          report(v.src);
        }
        const sources = v.querySelectorAll ? v.querySelectorAll('source') : [];
        for (const s of sources) {
          const sSrc = s.src || s.getAttribute('src');
          if (sSrc && looksLikeMediaUrl(sSrc)) {
            const q = s.getAttribute('label') || s.getAttribute('res') || s.getAttribute('data-quality') || '';
            out.standard.push({ url: sSrc, quality: q });
            report(sSrc, { quality: q });
          }
        }
      }
    } catch (e) {}
  }

  function collectAllMainWorldMedia() {
    const out = { hls: [], standard: [], model: [], perf: [] };

    // 1. xHamster / initials
    try {
      const initials = globalThis.initials || globalThis.__INITIAL_STATE__ || null;
      const sources =
        (initials && initials.xplayerSettings && initials.xplayerSettings.sources) ||
        (initials && initials.xplayerSettings2 && initials.xplayerSettings2.sources) ||
        null;

      if (sources && sources.hls && typeof sources.hls === 'object') {
        for (const key of ['url', 'fallback']) {
          if (typeof sources.hls[key] === 'string' && sources.hls[key]) {
            out.hls.push(sources.hls[key]);
          }
        }
      }

      if (sources && sources.standard && typeof sources.standard === 'object') {
        for (const list of Object.values(sources.standard)) {
          if (!Array.isArray(list)) continue;
          for (const fmt of list) {
            if (!fmt || typeof fmt !== 'object') continue;
            for (const key of ['url', 'fallback']) {
              if (typeof fmt[key] === 'string' && fmt[key]) {
                out.standard.push({
                  url: fmt[key],
                  quality: fmt.quality || fmt.label || ''
                });
              }
            }
          }
        }
      }

      const modelSources = initials && initials.videoModel && initials.videoModel.sources;
      if (modelSources && typeof modelSources === 'object') {
        for (const [formatId, formatsDict] of Object.entries(modelSources)) {
          if (formatId === 'download' || !formatsDict || typeof formatsDict !== 'object') continue;
          for (const [quality, file] of Object.entries(formatsDict)) {
            if (typeof file === 'string' && /^https?:\/\//i.test(file)) {
              out.model.push({ url: file, quality, formatId });
            }
          }
        }
      }
    } catch (e) {}

    // 2. Video.js
    collectVideoJsSources(out);

    // 3. JWPlayer
    collectJwPlayerSources(out);

    // 4. Direct DOM elements in main world
    collectDomMediaRaw(out);

    // 5. Performance entries
    try {
      const entries = performance.getEntriesByType('resource') || [];
      for (const entry of entries) {
        const name = entry && entry.name;
        if (looksLikeMediaUrl(name)) out.perf.push(name);
      }
    } catch (e) {}

    return out;
  }

  // Expose one-shot collector for background / scripting.executeScript
  globalThis.__FVD_COLLECT_PAGE_MEDIA__ = collectAllMainWorldMedia;

  // Intercept HTMLMediaElement property assignments
  try {
    const origMediaSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (origMediaSrcDesc && origMediaSrcDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        get() {
          return origMediaSrcDesc.get.call(this);
        },
        set(val) {
          if (val && typeof val === 'string' && looksLikeMediaUrl(val)) {
            report(val);
          }
          return origMediaSrcDesc.set.call(this, val);
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {}

  try {
    const origSourceSrcDesc = Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, 'src');
    if (origSourceSrcDesc && origSourceSrcDesc.set) {
      Object.defineProperty(HTMLSourceElement.prototype, 'src', {
        get() {
          return origSourceSrcDesc.get.call(this);
        },
        set(val) {
          if (val && typeof val === 'string' && looksLikeMediaUrl(val)) {
            const q = (this.getAttribute && (this.getAttribute('label') || this.getAttribute('res'))) || '';
            report(val, { quality: q });
          }
          return origSourceSrcDesc.set.call(this, val);
        },
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {}

  // Live capture while the user watches (survives service-worker sleep)
  try {
    const origFetch = globalThis.fetch;
    if (typeof origFetch === 'function') {
      globalThis.fetch = function (...args) {
        try {
          const req = args[0];
          const url = typeof req === 'string' ? req : (req && req.url);
          if (url) report(url);
        } catch (e) {}
        return origFetch.apply(this, args);
      };
    }
  } catch (e) {}

  try {
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      try {
        if (url) report(String(url));
      } catch (e) {}
      return origOpen.call(this, method, url, ...rest);
    };
  } catch (e) {}

  // Push already-buffered resources once on install
  try {
    const snap = collectAllMainWorldMedia();
    for (const u of snap.perf) report(u);
    for (const u of snap.hls) report(u, { rawCipher: true, kind: 'hls' });
    for (const s of snap.standard) report(s.url, { rawCipher: true, kind: 'standard', quality: s.quality });
    for (const s of snap.model) report(s.url, { kind: 'model', quality: s.quality });
  } catch (e) {}
})();
