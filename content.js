// Flash Video Downloader - Content Script (on-demand injection via activeTab + scripting)
// Scans DOM for openly accessible media on the active tab only.

(() => {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
  // Bump token when SCAN_PAGE logic changes so re-inject works without full tab reload
  const FVD_CONTENT_BUILD = '3.3.7-universal';
  if (globalThis.__FVD_CONTENT_BUILD__ === FVD_CONTENT_BUILD) return;
  globalThis.__FVD_CONTENT_BUILD__ = FVD_CONTENT_BUILD;
  globalThis.__FVD_CONTENT_LOADED__ = true;

  const hookedMediaUrls = globalThis.__FVD_HOOKED_MEDIA__ || new Map();
  globalThis.__FVD_HOOKED_MEDIA__ = hookedMediaUrls;

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
    if (rect.width < 30 || rect.height < 30) return false;
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

  function isFakeOrTrailerMediaUrl(url) {
    const u = (url || '').toLowerCase();
    // Site-local /videofile/*.mp4 stubs are often 404 placeholders (e.g. ukdevilz)
    if (/\/videofile\/[^/?#]+\.mp4(?:\?|#|$)/i.test(u) && !/pvvstream\.pro/i.test(u)) return true;
    // Related-video trailers / previews – not the main watch source
    if (/\/tr_\d+p\.mp4/i.test(u)) return true;
    if (/\/preview_\d+\.(jpg|jpeg|png|webp|gif)/i.test(u)) return true;
    if (isTubeCmsVideoUrl(u) || /\b(240p|360p|480p|720p|1080p|1440p|2160p|4k)\b/i.test(u)) return false;
    if (/(?:^|[\/_\-.?&=])(thumbnails?|preview|trailer|poster|sprite|placeholder|avatar|favicon|banner)(?:[\/_\-.?&=]|$)/i.test(u)) return true;
    return false;
  }

  // Alla filändelser vi känner igen – samma lista som background.js MEDIA_EXTENSIONS.
  // Används för att hitta länkar/URL:er till riktiga mediafiler oavsett container.
  const MEDIA_URL_EXTENSIONS = [
    'mp4', 'm4v', 'm4s', 'fmp4', 'cmfv', 'cmfa', 'webm', 'flv', 'f4v',
    'm3u8', 'm3u', 'mpd', 'ts', 'm2ts', 'mts', 'mov', 'avi', 'mkv', 'ogv', 'ogm',
    '3gp', '3g2', 'wmv', 'asf', 'vob', 'm2v', 'divx', 'mpg', 'mpeg', 'av1', 'hevc',
    'mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac', 'wma'
  ];

  function hasMediaExtension(url) {
    const u = (url || '').toLowerCase().split(/[?#]/)[0].replace(/\/+$/, '');
    return MEDIA_URL_EXTENSIONS.some(ext => u.endsWith('.' + ext));
  }

  // Src-kandidater från ett <video>/<audio>/<source>-element.
  // Läser även getAttribute('src') så att relativa attribut visas innan webbläsaren
  // hunnit absolutifiera dem, plus alla <source>-barn, och extraherar kvalitetsmärkning.
  function mediaElementCandidateObjects(el) {
    const out = [];
    const add = (url, quality) => {
      if (!url || typeof url !== 'string') return;
      const clean = url.trim();
      if (clean && !clean.startsWith('javascript:') && !clean.startsWith('data:')) {
        out.push({ url: clean, quality: quality ? String(quality) : '' });
      }
    };

    if (el.tagName === 'SOURCE') {
      const q = el.getAttribute('label') || el.getAttribute('res') || el.getAttribute('data-quality') || el.getAttribute('title') || '';
      add(el.getAttribute('src'), q);
      add(el.src, q);
    } else {
      add(el.getAttribute ? el.getAttribute('src') : null, '');
      add(el.src, '');
      add(el.currentSrc, '');
      if (el.querySelectorAll) {
        el.querySelectorAll('source').forEach(src => {
          const q = src.getAttribute('label') || src.getAttribute('res') || src.getAttribute('data-quality') || src.getAttribute('title') || '';
          add(src.getAttribute('src'), q);
          add(src.src, q);
        });
      }
    }
    return out;
  }

  // Länkar som pekar direkt på en videofil, t.ex.
  // <a href="/mp4/klipp-1080p.mp4" download>. Dessa syns aldrig i nätverkssniffningen
  // förrän användaren klickar, så de måste läsas direkt från DOM.
  function collectMediaLinks(addUrl) {
    const anchors = document.querySelectorAll('a[href], a[download]');
    for (const a of anchors) {
      const rawHref = a.getAttribute('href');
      if (!rawHref) continue;
      if (/^(#|data:|javascript:|mailto:|tel:)/i.test(rawHref.trim())) continue;
      let href;
      try {
        href = new URL(rawHref.trim(), document.baseURI || window.location.href).href;
      } catch (e) {
        continue;
      }
      if (!/^(https?:|blob:)/i.test(href)) continue;
      const hasDownloadAttr = a.hasAttribute('download');
      if (!hasDownloadAttr && !hasMediaExtension(href)) continue;
      const label = (a.getAttribute('download') || a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent || '').trim();
      addUrl(href, /\.[a-z0-9]{2,5}$/i.test(label) ? label : '', 0, { fromLink: true });
    }
  }

  // Alla mediaelement på sidan, även de som ligger under folden eller är dolda –
  // annars missas t.ex. rutnät med 18 videor på samma sida.
  function collectAllMediaElements() {
    return [...document.querySelectorAll('video, audio, source')];
  }

  function parseJsonObjectAfterAssign(text, assignPattern) {
    const match = text.match(assignPattern);
    if (!match || match.index == null) return null;
    const start = match.index + match[0].length;
    if (text[start] !== '{') return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch (e) {
            return null;
          }
        }
      }
    }
    return null;
  }

  // --- XOR URL decipher (xHamster-style xplayerSettings ciphertext) ---
  function toInt32(n) {
    return n | 0;
  }

  function u32ShiftRight(s, bits) {
    return (s >>> bits) | 0;
  }

  function createXhByteGenerator(algoId, seed) {
    let s = toInt32(seed);
    const algos = {
      1(v) {
        s = toInt32(Math.imul(v, 1664525) + 1013904223);
        return s;
      },
      2(v) {
        let x = toInt32(v ^ (v << 13));
        x = toInt32(x ^ u32ShiftRight(x, 17));
        s = toInt32(x ^ (x << 5));
        return s;
      },
      3(v) {
        s = toInt32(v + 0x9e3779b9);
        let x = toInt32(s ^ u32ShiftRight(s, 16));
        x = toInt32(Math.imul(x, toInt32(0x85ebca77)));
        x = toInt32(x ^ u32ShiftRight(x, 13));
        x = toInt32(Math.imul(x, toInt32(0xc2b2ae3d)));
        return toInt32(x ^ u32ShiftRight(x, 16));
      },
      4(v) {
        s = toInt32(v + 0x6d2b79f5);
        let x = toInt32((s << 7) | u32ShiftRight(s, 25));
        x = toInt32(x + 0x9e3779b9);
        x = toInt32(x ^ u32ShiftRight(x, 11));
        return toInt32(Math.imul(x, 0x27d4eb2d));
      },
      5(v) {
        let x = toInt32(v ^ (v << 7));
        x = toInt32(x ^ u32ShiftRight(x, 9));
        x = toInt32(x ^ (x << 8));
        s = toInt32(x + 0xa5a5a5a5);
        return s;
      },
      6(v) {
        s = toInt32(Math.imul(v, toInt32(0x2c9277b5)) + toInt32(0xac564b05));
        const s2 = toInt32(s ^ u32ShiftRight(s, 18));
        const shift = u32ShiftRight(s, 27) & 31;
        return toInt32(u32ShiftRight(s2, shift));
      },
      7(v) {
        s = toInt32(v + toInt32(0x9e3779b9));
        let e = toInt32(s ^ (s << 5));
        e = toInt32(Math.imul(e, toInt32(0x7feb352d)));
        e = toInt32(e ^ u32ShiftRight(e, 15));
        return toInt32(Math.imul(e, toInt32(0x846ca68b)));
      }
    };
    const algo = algos[algoId];
    if (!algo) return null;
    return function nextByte() {
      return algo(s) & 0xff;
    };
  }

  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }

  function decipherXhHexString(hexString) {
    if (!hexString || !/^[0-9a-fA-F]{12,}$/.test(hexString) || hexString.length % 2 !== 0) return null;
    try {
      const byteData = hexToBytes(hexString);
      if (byteData.length < 6) return null;
      const seed = new DataView(byteData.buffer, byteData.byteOffset + 1, 4).getInt32(0, true);
      const nextByte = createXhByteGenerator(byteData[0], seed);
      if (!nextByte) return null;
      let decoded = '';
      for (let i = 5; i < byteData.length; i++) {
        decoded += String.fromCharCode(byteData[i] ^ nextByte());
      }
      return decoded;
    } catch (e) {
      return null;
    }
  }

  function decipherXhFormatUrl(formatUrl) {
    if (!formatUrl || typeof formatUrl !== 'string') return null;
    const raw = formatUrl.trim();

    // Bare hex ciphertext → usually a full https URL after XOR
    if (/^[0-9a-fA-F]{12,}$/.test(raw) && raw.length % 2 === 0) {
      return decipherXhHexString(raw);
    }

    let parsed;
    try {
      parsed = new URL(raw, window.location.href);
    } catch (e) {
      return null;
    }

    // /HEX/rest or /HEX,rest
    let pathMatch = parsed.pathname.match(/^\/([0-9a-fA-F]{12,})([/,].+)$/);
    if (pathMatch) {
      const deciphered = decipherXhHexString(pathMatch[1]);
      if (!deciphered) return null;
      if (/^https?:\/\//i.test(deciphered)) return deciphered;
      parsed.pathname = '/' + String(deciphered).replace(/^\//, '') + pathMatch[2];
      return parsed.href;
    }

    // /HEX only (no remainder) – common after site changes
    pathMatch = parsed.pathname.match(/^\/([0-9a-fA-F]{12,})$/);
    if (pathMatch) {
      const deciphered = decipherXhHexString(pathMatch[1]);
      if (!deciphered) return null;
      if (/^https?:\/\//i.test(deciphered)) return deciphered;
      parsed.pathname = '/' + String(deciphered).replace(/^\//, '');
      return parsed.href;
    }

    if (/^https?:\/\//i.test(parsed.href)) return parsed.href;
    return null;
  }

  function qualityLabelFrom(value) {
    if (value == null) return '';
    const s = String(value).replace(/p$/i, '');
    return /^\d{3,4}$/.test(s) ? `${s}p` : (String(value) || '');
  }

  function resolveMaybeCipherUrl(raw, meta) {
    if (!raw || typeof raw !== 'string') return null;
    let url = null;
    if (meta && meta.rawCipher) {
      url = decipherXhFormatUrl(raw);
    } else if (/^[0-9a-fA-F]{12,}$/.test(raw.trim()) && raw.trim().length % 2 === 0) {
      url = decipherXhFormatUrl(raw);
    } else if (/^https?:\/\//i.test(raw)) {
      url = raw;
    } else {
      url = decipherXhFormatUrl(raw);
    }
    if (!url) return null;
    if (url.startsWith('//')) url = 'https:' + url;
    if (!/^https?:\/\//i.test(url)) return null;
    // Reject failed XOR that yields printable junk without a real media hint
    if (!/\.(m3u8|m3u|mpd|mp4|webm)(?:\?|#|$|\/)/i.test(url) && !/\/hls\//i.test(url) && !(meta && meta.kind === 'model')) {
      // Still allow CDN paths that look like video delivery
      if (!/\/(video|videos|media|stream|play)/i.test(url)) return null;
    }
    return url;
  }

  function rememberHookedUrl(rawUrl, meta) {
    const url = resolveMaybeCipherUrl(rawUrl, meta);
    if (!url || !/^https?:\/\//i.test(url)) return null;
    if (typeof fvdIsBlockedUrl === 'function' && fvdIsBlockedUrl(url)) return null;
    if (isFakeOrTrailerMediaUrl(url)) return null;
    const quality = (meta && meta.quality) ? qualityLabelFrom(meta.quality) : '';
    const isHls = /\.m3u8(?:\?|#|$|\/)/i.test(url) || (meta && meta.kind === 'hls');
    hookedMediaUrls.set(url, {
      fromPlaylist: true,
      quality: quality || (isHls ? 'HLS' : ''),
      format: isHls ? 'M3U8' : undefined
    });
    try {
      const pageTitle = (document.title || 'video').trim() || 'video';
      chrome.runtime.sendMessage({
        type: 'FOUND_DOM_MEDIA',
        items: [{
          url,
          filename: `${pageTitle}${quality ? '_' + quality : (isHls ? '_hls' : '')}.mp4`,
          format: isHls ? 'M3U8' : 'MP4',
          fromPlaylist: true,
          quality: quality || (isHls ? 'HLS' : '')
        }]
      });
    } catch (e) {}
    return url;
  }

  function ingestMainWorldData(data, addUrl) {
    if (!data || typeof data !== 'object') return;
    const pageTitle = (document.title || 'video').trim() || 'video';

    for (const raw of data.hls || []) {
      const url = resolveMaybeCipherUrl(raw, { rawCipher: true, kind: 'hls' });
      if (!url) continue;
      addUrl(url, `${pageTitle}_hls.mp4`, 0, { fromPlaylist: true, quality: 'HLS' });
      hookedMediaUrls.set(url, { fromPlaylist: true, quality: 'HLS', format: 'M3U8' });
    }

    for (const entry of data.standard || []) {
      const raw = entry && (entry.url || (typeof entry === 'string' ? entry : null));
      const url = resolveMaybeCipherUrl(raw, { rawCipher: true, kind: 'standard' });
      if (!url) continue;
      const quality = qualityLabelFrom(entry && entry.quality);
      addUrl(url, `${pageTitle}${quality ? '_' + quality : ''}.mp4`, 0, {
        fromPlaylist: true,
        quality
      });
      hookedMediaUrls.set(url, { fromPlaylist: true, quality });
    }

    for (const entry of data.model || []) {
      const url = entry && entry.url;
      if (!url) continue;
      const quality = qualityLabelFrom(entry.quality);
      addUrl(url, `${pageTitle}${quality ? '_' + quality : ''}.mp4`, 0, {
        fromPlaylist: true,
        quality
      });
      hookedMediaUrls.set(url, { fromPlaylist: true, quality });
    }

    for (const url of data.perf || []) {
      if (!url || !/^https?:\/\//i.test(url)) continue;
      addUrl(url, `${pageTitle}.mp4`, 0, { fromPlaylist: true, quality: /\.m3u8/i.test(url) ? 'HLS' : '' });
    }
  }

  // JWPlayer / tube CMS pages often expose progressive MP4 URLs in window.playlist
  // (content scripts cannot read page JS globals – parse inline script text instead).
  function collectEmbeddedPlaylistSources(addUrl) {
    const scripts = document.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text || text.length > 500000) continue;
      if (!/playlist|sources/i.test(text)) continue;

      const playlist =
        parseJsonObjectAfterAssign(text, /window\.playlist\s*=\s*/) ||
        parseJsonObjectAfterAssign(text, /(?:var|let|const)\s+playlist\s*=\s*/);

      const sources = playlist && Array.isArray(playlist.sources) ? playlist.sources : null;
      if (!sources || !sources.length) continue;

      const pageTitle = (document.title || 'video').trim() || 'video';
      for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        const file = source.file || source.src || source.url;
        if (!file || typeof file !== 'string') continue;
        if (isFakeOrTrailerMediaUrl(file)) continue;
        const label = source.label != null ? String(source.label).replace(/p$/i, '') : '';
        const quality = label && /^\d{3,4}$/.test(label) ? `${label}p` : (label || '');
        const typeHint = (source.type || '').toLowerCase();
        let hintName = pageTitle;
        if (quality) hintName = `${pageTitle}_${quality}`;
        if (typeHint.includes('webm')) hintName += '.webm';
        else hintName += '.mp4';
        addUrl(file, hintName, 0, { fromPlaylist: true, quality });
      }
    }
  }

  // xHamster / xplayer: sources live in window.initials (often XOR-obfuscated)
  function collectXplayerSources(addUrl) {
    const scripts = document.querySelectorAll('script:not([src])');
    const pageTitle = (document.title || 'video').trim() || 'video';
    let foundHls = false;

    for (const script of scripts) {
      const text = script.textContent || '';
      if (!text || text.length > 2500000) continue;
      if (!/initials|xplayerSettings/i.test(text)) continue;

      const initials = parseJsonObjectAfterAssign(text, /window\.initials\s*=\s*/);
      if (!initials || typeof initials !== 'object') continue;

      const xplayer =
        (initials.xplayerSettings && initials.xplayerSettings.sources) ||
        (initials.xplayerSettings2 && initials.xplayerSettings2.sources) ||
        null;
      if (!xplayer || typeof xplayer !== 'object') continue;

      const hls = xplayer.hls;
      if (hls && typeof hls === 'object') {
        for (const key of ['url', 'fallback']) {
          const raw = hls[key];
          if (!raw || typeof raw !== 'string') continue;
          const url = decipherXhFormatUrl(raw);
          if (!url || isFakeOrTrailerMediaUrl(url)) continue;
          foundHls = true;
          addUrl(url, `${pageTitle}_hls.mp4`, 0, { fromPlaylist: true, quality: 'HLS' });
        }
      }

      // Progressive MP4s on this stack often 403 / "Wrong key" – only use if no HLS
      if (!foundHls) {
        const standard = xplayer.standard;
        if (standard && typeof standard === 'object') {
          for (const formatsList of Object.values(standard)) {
            if (!Array.isArray(formatsList)) continue;
            for (const fmt of formatsList) {
              if (!fmt || typeof fmt !== 'object') continue;
              const quality = qualityLabelFrom(fmt.quality || fmt.label);
              for (const key of ['url', 'fallback']) {
                const raw = fmt[key];
                if (!raw || typeof raw !== 'string') continue;
                const url = decipherXhFormatUrl(raw);
                if (!url || isFakeOrTrailerMediaUrl(url)) continue;
                let hintName = pageTitle;
                if (quality) hintName = `${pageTitle}_${quality}`;
                hintName += /\.m3u8/i.test(url) ? '.mp4' : '.mp4';
                addUrl(url, hintName, 0, { fromPlaylist: true, quality });
              }
            }
          }
        }
      }

      // Plain videoModel.sources (unencrypted progressive URLs on some mirrors)
      const modelSources = initials.videoModel && initials.videoModel.sources;
      if (modelSources && typeof modelSources === 'object' && !foundHls) {
        for (const [formatId, formatsDict] of Object.entries(modelSources)) {
          if (formatId === 'download' || !formatsDict || typeof formatsDict !== 'object') continue;
          for (const [qualityKey, formatItem] of Object.entries(formatsDict)) {
            const file = typeof formatItem === 'string' ? formatItem : null;
            if (!file || !/^https?:\/\//i.test(file)) continue;
            if (isFakeOrTrailerMediaUrl(file)) continue;
            const quality = qualityLabelFrom(qualityKey);
            addUrl(file, `${pageTitle}_${quality || formatId}.mp4`, 0, {
              fromPlaylist: true,
              quality
            });
          }
        }
      }

      if (foundHls) break;
    }
  }

  function isTubeCmsVideoUrl(url) {
    const u = (url || '').toLowerCase();
    if (/\/get_file\//i.test(u)) return true;
    if (/\/video[_-]?file\//i.test(u)) return true;
    if (/\/contents\/videos?\//i.test(u) && /\.(mp4|webm|m3u8|mov)/i.test(u)) return true;
    if (/pvvstream\.pro\/videos\//i.test(u) && /\.mp4/i.test(u)) return true;
    if (/\/vid_\d+p\.mp4/i.test(u)) return true;
    if (/\/vid\d*\//i.test(u) && /\.mp4/i.test(u)) return true;
    return false;
  }

  function collectJsonLdVideoSources(addUrl) {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const pageTitle = (document.title || 'video').trim() || 'video';
    for (const script of scripts) {
      try {
        const text = script.textContent || '';
        if (!text || (!text.includes('contentUrl') && !text.includes('VideoObject') && !text.includes('embedUrl'))) continue;
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : (data['@graph'] || [data]);
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const t = item['@type'];
          const isVideo = t === 'VideoObject' || (Array.isArray(t) && t.includes('VideoObject'));
          if (isVideo || item.contentUrl) {
            const name = (item.name || pageTitle).trim();
            const quality = qualityLabelFrom(item.videoQuality);
            if (item.contentUrl && typeof item.contentUrl === 'string') {
              addUrl(item.contentUrl, `${name}${quality ? '_' + quality : ''}.mp4`, 0, {
                fromPlaylist: true,
                quality
              });
            }
            if (item.embedUrl && typeof item.embedUrl === 'string' && hasMediaExtension(item.embedUrl)) {
              addUrl(item.embedUrl, `${name}.mp4`, 0, { fromPlaylist: true });
            }
          }
        }
      } catch (e) {}
    }
  }

  function collectMetaTagSources(addUrl) {
    const pageTitle = (document.title || 'video').trim() || 'video';
    const metas = document.querySelectorAll('meta[property^="og:video"], meta[name^="twitter:player:stream"], link[rel="video_src"]');
    for (const m of metas) {
      const content = m.getAttribute('content') || m.getAttribute('href');
      if (content && typeof content === 'string' && hasMediaExtension(content)) {
        addUrl(content, `${pageTitle}.mp4`, 0, { fromPlaylist: true });
      }
    }
  }

  function collectDataAttributeSources(addUrl) {
    const pageTitle = (document.title || 'video').trim() || 'video';
    const selector = '[data-src], [data-video], [data-video-url], [data-url], [data-file], [data-stream], [data-hls], [data-mp4], [data-live]';
    const elements = document.querySelectorAll(selector);
    const attrs = ['data-src', 'data-video', 'data-video-url', 'data-url', 'data-file', 'data-stream', 'data-hls', 'data-mp4', 'data-live'];
    for (const el of elements) {
      for (const attr of attrs) {
        const val = el.getAttribute(attr);
        if (!val || typeof val !== 'string') continue;
        if (hasMediaExtension(val) || isTubeCmsVideoUrl(val)) {
          if (isFakeOrTrailerMediaUrl(val)) continue;
          if (/trafficready|magsrv|pemsrv|doubleclick/i.test(val)) continue;
          const q = el.getAttribute('label') || el.getAttribute('res') || el.getAttribute('data-quality') || '';
          addUrl(val, `${pageTitle}${q ? '_' + q : ''}.mp4`, 0, { fromElement: true, quality: q });
        }
      }
    }
  }

  function collectScriptRegexSources(addUrl) {
    const scripts = document.querySelectorAll('script:not([src])');
    const pageTitle = (document.title || 'video').trim() || 'video';
    const MEDIA_REGEX = /https?:\/\/[^\s"'<>]+\.(?:mp4|webm|m3u8|mpd|mov|mkv)(?:\?[^\s"'<>]*)?/gi;
    for (const s of scripts) {
      const text = s.textContent || '';
      if (!text || text.length > 3000000) continue;
      if (!/mp4|m3u8|webm|video|source|player/i.test(text)) continue;
      let match;
      while ((match = MEDIA_REGEX.exec(text)) !== null) {
        const url = match[0];
        if (!url || isFakeOrTrailerMediaUrl(url)) continue;
        if (/trafficready|magsrv|pemsrv|doubleclick|google-analytics/i.test(url)) continue;
        addUrl(url, `${pageTitle}.mp4`, 0, { fromPlaylist: true });
      }
    }
  }

  function scanDOM(mainWorldData) {
    if (!chrome.runtime || !chrome.runtime.id) {
      return { items: [], visibleVideoCount: 0, visibleUrls: [] };
    }

    const discovered = new Set();
    const visibleUrls = new Set();
    const items = [];
    const visibleVideos = collectVisibleVideos();

    function addUrl(rawUrl, hint, durationSec, meta) {
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
      if (!isBlob && isFakeOrTrailerMediaUrl(cleanUrl)) return;

      const allowHttp = cleanUrl.startsWith('http');
      const allowBlob = isBlob;
      if (!discovered.has(cleanUrl) && (allowHttp || allowBlob)) {
        discovered.add(cleanUrl);
        // Playlist CDN URLs count as the real page media (even before <video> has a src)
        if (!isBlob) visibleUrls.add(cleanUrl);
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
          if (hint && meta && (meta.fromPlaylist || meta.fromElement) && hint.includes('.')) {
            filename = hint.split(/[/\\]/).pop();
          }
          if (meta && meta.quality && !filename.includes(meta.quality) && filename.toLowerCase().endsWith('.mp4')) {
            filename = filename.replace(/\.mp4$/i, `_${meta.quality}.mp4`);
          }
          let rawExt = (filename.split('.').pop() || '').toUpperCase();
          if (!rawExt || rawExt.length > 5 || rawExt === filename.toUpperCase()) {
            const urlExt = (cleanUrl.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i) || [])[1];
            if (urlExt) rawExt = urlExt.toUpperCase();
          }
          if (/\.m3u8(?:\?|#|$|\/)/i.test(cleanUrl) || rawExt === 'M3U8' || rawExt === 'M3U') {
            ext = 'M3U8';
          } else if (/\.mpd(?:\?|#|$|\/)/i.test(cleanUrl) || rawExt === 'MPD') {
            ext = 'MPD';
          } else if (['TS', 'M4S', 'FMP4', 'M2TS'].includes(rawExt)) {
            ext = 'MP4';
          } else {
            ext = rawExt && rawExt.length <= 5 ? rawExt : 'VIDEO';
          }
          if (!filename.includes('.')) filename = filename + '.mp4';
          else if (/\.(m3u8|m3u|mpd|ts|m4s|fmp4)$/i.test(filename)) {
            filename = filename.replace(/\.(m3u8|m3u|mpd|ts|m4s|fmp4)$/i, '.mp4');
          }
        }
        if (isBlob && !filename.toLowerCase().endsWith('.mp4')) {
          filename = filename.replace(/\.[a-z0-9]+$/i, '') + '.mp4';
          if (!filename.includes('.')) filename += '.mp4';
        }
        const item = {
          url: cleanUrl,
          filename: decodeURIComponent(filename),
          format: ext,
          duration: formatTimeText(durationSec)
        };
        if (meta && meta.fromPlaylist) item.fromPlaylist = true;
        if (meta && meta.quality) item.quality = meta.quality;
        if (meta && meta.format) item.format = meta.format;
        items.push(item);
      }
    }

    try {
      collectEmbeddedPlaylistSources(addUrl);
    } catch (err) {}

    try {
      collectXplayerSources(addUrl);
    } catch (err) {}

    try {
      collectJsonLdVideoSources(addUrl);
    } catch (err) {}

    try {
      collectMetaTagSources(addUrl);
    } catch (err) {}

    try {
      collectMediaLinks(addUrl);
    } catch (err) {}

    try {
      collectDataAttributeSources(addUrl);
    } catch (err) {}

    try {
      collectScriptRegexSources(addUrl);
    } catch (err) {}

    try {
      ingestMainWorldData(mainWorldData, addUrl);
    } catch (err) {}

    try {
      for (const [url, meta] of hookedMediaUrls.entries()) {
        addUrl(url, (document.title || 'video') + '.mp4', 0, {
          fromPlaylist: true,
          quality: (meta && meta.quality) || '',
          format: meta && meta.format
        });
      }
    } catch (err) {}

    const hasPlaylistSources = items.some(i => i.fromPlaylist || !String(i.url).startsWith('blob:'));

    try {
      visibleVideos.forEach(el => {
        const dur = el.duration && !isNaN(el.duration) && isFinite(el.duration) ? el.duration : 0;
        const hintName = el.getAttribute('data-filename') || el.title || document.title || 'video.mp4';
        mediaElementCandidateObjects(el).forEach(cand => {
          // Skip MSE blob when we already have real playlist/CDN URLs
          if (hasPlaylistSources && String(cand.url).startsWith('blob:')) return;
          addUrl(cand.url, hintName, dur, { fromElement: true, quality: cand.quality });
        });
      });
    } catch (err) {}

    try {
      const handled = new Set(visibleVideos);
      collectAllMediaElements().forEach(el => {
        if (handled.has(el)) return;
        handled.add(el);
        const dur = el.duration && !isNaN(el.duration) && isFinite(el.duration) ? el.duration : 0;
        const hintName = (el.getAttribute && el.getAttribute('data-filename')) || el.title || document.title || 'video.mp4';
        mediaElementCandidateObjects(el).forEach(cand => {
          if (hasPlaylistSources && String(cand.url).startsWith('blob:')) return;
          addUrl(cand.url, hintName, dur, { fromElement: true, quality: cand.quality });
        });
      });
    } catch (err) {}

    // Prioritize main player/playlist sources over random background links
    const explicitPlaylist = items.filter(i => i.fromPlaylist);
    let finalItems = items;
    if (explicitPlaylist.length > 0) {
      finalItems = explicitPlaylist;
    } else {
      const tubeSources = items.filter(i => /\/vid_\d+p\.mp4/i.test(i.url || '') || /\/vid\d*\//i.test(i.url || ''));
      if (tubeSources.length > 0) finalItems = tubeSources;
    }

    return {
      items: finalItems,
      visibleVideoCount: visibleVideos.length,
      visibleUrls: [...visibleUrls]
    };
  }

  globalThis.__FVD_SCAN_DOM__ = scanDOM;

  if (!globalThis.__FVD_PAGE_MSG_BOUND__) {
    globalThis.__FVD_PAGE_MSG_BOUND__ = true;
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== 'FVD_PAGE_HOOK' || data.type !== 'MEDIA_URL') return;
      rememberHookedUrl(data.url, data.meta || {});
    });
  }

  function handleContentMessage(req, sender, sendResponse) {
    if (req && req.type === 'SCAN_PAGE') {
      const scan = globalThis.__FVD_SCAN_DOM__ || scanDOM;
      sendResponse(scan(req.mainWorld || null));
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
    if (req && req.type === 'DOWNLOAD_BLOB') {
      (async () => {
        try {
          if (!req.url || !req.url.startsWith('blob:')) {
            sendResponse({ error: 'Invalid blob URL' });
            return;
          }
          const res = await fetch(req.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (!blob || blob.size === 0) throw new Error('Empty blob');

          const filename = (req.filename || 'video.mp4').replace(/[/\\?%*:|"<>]/g, '_');
          const objUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = objUrl;
          anchor.download = filename;
          anchor.rel = 'noopener';
          anchor.style.display = 'none';
          document.documentElement.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(objUrl), 120000);
          sendResponse({ ok: true, size: blob.size });
        } catch (e) {
          sendResponse({ error: e && e.message ? e.message : 'Blob download failed' });
        }
      })();
      return true;
    }
    return false;
  }

  globalThis.__FVD_HANDLE_MSG__ = handleContentMessage;

  if (!globalThis.__FVD_LISTENER_BOUND__) {
    globalThis.__FVD_LISTENER_BOUND__ = true;
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (typeof globalThis.__FVD_HANDLE_MSG__ === 'function') {
        return globalThis.__FVD_HANDLE_MSG__(req, sender, sendResponse);
      }
      return false;
    });
  }

  function autoScanAndNotify() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
      const scan = globalThis.__FVD_SCAN_DOM__ ? globalThis.__FVD_SCAN_DOM__() : scanDOM();
      if (scan && Array.isArray(scan.items) && scan.items.length > 0) {
        chrome.runtime.sendMessage({
          type: 'FOUND_DOM_MEDIA',
          items: scan.items
        }).catch(() => {});
      }
    } catch (e) {}
  }

  setTimeout(autoScanAndNotify, 350);
  setTimeout(autoScanAndNotify, 1200);

  try {
    let obsTimer = null;
    const observer = new MutationObserver((mutations) => {
      let hasMediaChange = false;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              const tag = node.tagName;
              if (tag === 'VIDEO' || tag === 'SOURCE' || (node.querySelector && node.querySelector('video, source'))) {
                hasMediaChange = true;
                break;
              }
            }
          }
        }
        if (hasMediaChange) break;
      }
      if (hasMediaChange) {
        if (obsTimer) clearTimeout(obsTimer);
        obsTimer = setTimeout(autoScanAndNotify, 500);
      }
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch (e) {}
})();
