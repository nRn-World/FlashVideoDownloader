// Flash Video Downloader - Enhanced Content Script with Duration Metadata Detection & Ultra-Smooth Video Seeking

(() => {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    return;
  }

  const MEDIA_REGEX = /https?:\/\/[^\s"'<>]+\.(?:mp4|m4v|m4s|fmp4|webm|flv|f4v|m3u8|m3u|mpd|ts|m2ts|mov|avi|mkv|ogv|3gp|3g2|wmv|mp3|m4a|aac|wav|ogg|opus|flac)(?:\?[^\s"'<>]*)?/gi;
  const BLOB_REGEX = /blob:https?:\/\/[^\s"'<>]+/gi;

  function formatTime(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '0:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const sStr = s < 10 ? '0' + s : s;
    if (h > 0) {
      const mStr = m < 10 ? '0' + m : m;
      return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
  }

  function formatTimeText(sec) {
    if (!sec || isNaN(sec) || sec <= 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  // ==========================================
  // ULTRA-SMOOTH VIDEO SEEKING & KEYBOARD ENGINE
  // Eliminates black screen, decoder stalls, and lag on large video files
  // ==========================================

  let lastHoveredVideo = null;
  let seekState = new WeakMap();

  document.addEventListener('mouseover', (e) => {
    const video = e.target.closest('video') || (e.target.shadowRoot && e.target.shadowRoot.querySelector('video'));
    if (video) lastHoveredVideo = video;
  }, true);

  function getActiveVideo() {
    // 1. Check fullscreen element
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      if (fsEl.tagName === 'VIDEO') return fsEl;
      const v = fsEl.querySelector('video');
      if (v) return v;
    }

    // 2. Check currently playing videos
    const videos = Array.from(document.querySelectorAll('video')).filter(v => v.src || v.currentSrc || v.querySelector('source'));
    const playing = videos.filter(v => !v.paused && !v.ended && v.readyState > 1);
    if (playing.length === 1) return playing[0];

    // 3. Check hovered video
    if (lastHoveredVideo && document.contains(lastHoveredVideo)) {
      return lastHoveredVideo;
    }

    // 4. Fallback to largest visible video
    if (videos.length > 0) {
      return videos.reduce((best, v) => {
        const rect = v.getBoundingClientRect();
        const area = rect.width * rect.height;
        const bestRect = best.getBoundingClientRect();
        const bestArea = bestRect.width * bestRect.height;
        return area > bestArea ? v : best;
      }, videos[0]);
    }

    return null;
  }

  function getOrCreateOsd(video) {
    let parent = video.parentElement || document.body;
    if (parent.tagName === 'HTML' || parent.tagName === 'BODY') {
      parent = document.body;
    }

    let osd = parent.querySelector('.fvd-smooth-osd');
    if (!osd) {
      osd = document.createElement('div');
      osd.className = 'fvd-smooth-osd';
      osd.setAttribute('style', `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        background: rgba(15, 23, 42, 0.88);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
        padding: 12px 24px;
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.15);
        font-size: 16px;
        font-weight: 600;
        letter-spacing: 0.3px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        pointer-events: none;
        z-index: 2147483647;
        opacity: 0;
        transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      `);

      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(osd);
    }
    return osd;
  }

  function showOsd(video, icon, text, subtext) {
    const osd = getOrCreateOsd(video);
    osd.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; font-size: 20px;">
        <span>${icon}</span>
        <span style="font-size: 18px; font-weight: 700;">${text}</span>
      </div>
      ${subtext ? `<div style="font-size: 13px; color: #94a3b8; font-weight: 500;">${subtext}</div>` : ''}
    `;

    osd.style.opacity = '1';
    osd.style.transform = 'translate(-50%, -50%) scale(1)';

    if (osd._fadeTimer) clearTimeout(osd._fadeTimer);
    osd._fadeTimer = setTimeout(() => {
      osd.style.opacity = '0';
      osd.style.transform = 'translate(-50%, -50%) scale(0.9)';
    }, 700);
  }

  function performSmoothSeek(video, deltaSeconds) {
    if (!video || !isFinite(video.duration) || video.duration <= 0) {
      if (video && video.currentTime !== undefined) {
        try { video.currentTime = Math.max(0, video.currentTime + deltaSeconds); } catch(e) {}
      }
      return;
    }

    let state = seekState.get(video);
    if (!state) {
      state = {
        accumulatedDelta: 0,
        targetTime: video.currentTime,
        timer: null,
        isSeeking: false,
        wasPlaying: !video.paused
      };
      seekState.set(video, state);
    }

    // Accumulate deltas for fast multiple keypresses
    if (state.timer) {
      clearTimeout(state.timer);
      state.accumulatedDelta += deltaSeconds;
    } else {
      state.accumulatedDelta = deltaSeconds;
      state.targetTime = video.currentTime;
      state.wasPlaying = !video.paused;
    }

    const duration = video.duration || 0;
    const newTarget = Math.max(0, Math.min(duration, state.targetTime + state.accumulatedDelta));

    // Instant OSD visual feedback with 0 latency
    const isForward = state.accumulatedDelta > 0;
    const sign = isForward ? '+' : '';
    const arrowIcon = isForward ? '⏩' : '⏪';
    const deltaText = `${sign}${Math.round(state.accumulatedDelta)}s`;
    const timeInfo = `${formatTime(newTarget)} / ${formatTime(duration)}`;

    showOsd(video, arrowIcon, deltaText, timeInfo);

    // Apply seek smoothly without clogging the hardware decoder
    const applySeek = () => {
      state.timer = null;
      const finalTime = Math.max(0, Math.min(duration, state.targetTime + state.accumulatedDelta));
      state.accumulatedDelta = 0;

      // Use fastSeek if supported (skips decoding to nearest keyframe instantly with 0 lag/blackout)
      if (typeof video.fastSeek === 'function') {
        try {
          video.fastSeek(finalTime);
          return;
        } catch (e) {}
      }

      // Smooth fallback to currentTime
      try {
        video.currentTime = finalTime;
      } catch (e) {}
    };

    // Debounce rapid arrow key presses (75ms window) so intermediate frames don't freeze the decoder
    state.timer = setTimeout(applySeek, 75);
  }

  // Handle global keyboard shortcuts for smooth video navigation
  window.addEventListener('keydown', (e) => {
    // Skip if user is typing in form inputs, textareas, editable fields
    const target = e.target;
    if (target) {
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
        return;
      }
    }

    const video = getActiveVideo();
    if (!video) return;

    const key = e.key;
    const code = e.code;

    // Arrow Left / Right or J / L for seeking
    if (key === 'ArrowLeft' || key === 'ArrowRight' || code === 'KeyJ' || code === 'KeyL') {
      e.preventDefault();
      e.stopPropagation();

      let seekStep = 5;
      if (e.shiftKey) seekStep = 10;
      else if (e.ctrlKey || e.altKey) seekStep = 30;

      if (code === 'KeyJ') seekStep = 10;
      if (code === 'KeyL') seekStep = 10;

      const isLeft = (key === 'ArrowLeft' || code === 'KeyJ');
      performSmoothSeek(video, isLeft ? -seekStep : seekStep);
    }
    // Arrow Up / Down for volume
    else if (key === 'ArrowUp' || key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      const step = 0.05;
      const newVol = key === 'ArrowUp' ? Math.min(1, video.volume + step) : Math.max(0, video.volume - step);
      video.volume = newVol;
      video.muted = false;
      const volPercent = Math.round(newVol * 100);
      const icon = volPercent === 0 ? '🔇' : (volPercent < 50 ? '🔉' : '🔊');
      showOsd(video, icon, `${volPercent}%`, 'Volume');
    }
    // Space or KeyK for Play/Pause
    else if ((key === ' ' || code === 'KeyK') && target.tagName !== 'BUTTON') {
      e.preventDefault();
      e.stopPropagation();
      if (video.paused) {
        video.play().catch(() => {});
        showOsd(video, '▶', 'Play', formatTime(video.currentTime));
      } else {
        video.pause();
        showOsd(video, '⏸', 'Pause', formatTime(video.currentTime));
      }
    }
    // KeyF for Fullscreen
    else if (code === 'KeyF') {
      e.preventDefault();
      e.stopPropagation();
      if (!document.fullscreenElement) {
        const container = video.parentElement || video;
        if (container.requestFullscreen) container.requestFullscreen().catch(() => video.requestFullscreen().catch(() => {}));
        else if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      }
    }
    // KeyM for Mute
    else if (code === 'KeyM') {
      e.preventDefault();
      e.stopPropagation();
      video.muted = !video.muted;
      showOsd(video, video.muted ? '🔇' : '🔊', video.muted ? 'Muted' : 'Unmuted');
    }
  }, true);

  // ==========================================
  // MEDIA DISCOVERY & DOM SCANNER
  // ==========================================

  function scanDOM() {
    if (!chrome.runtime || !chrome.runtime.id) return [];

    const discovered = new Set();
    const items = [];

    function addUrl(rawUrl, hint, durationSec) {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      let cleanUrl = rawUrl.trim();
      if (!cleanUrl || cleanUrl.startsWith('data:') || cleanUrl.startsWith('javascript:')) {
        return;
      }
      const isBlob = cleanUrl.startsWith('blob:');
      try {
        if (!isBlob) cleanUrl = new URL(cleanUrl, window.location.href).href;
      } catch (e) {
        return;
      }
      const allowHttp = cleanUrl.startsWith('http');
      const allowBlob = isBlob;
      if (!discovered.has(cleanUrl) && (allowHttp || allowBlob)) {
        discovered.add(cleanUrl);
        let filename;
        let ext;
        if (isBlob) {
          filename = (hint && hint.includes('.')) ? hint : 'video.mp4';
          ext = 'MP4';
          // försök härled extension från hint eller video-typ
          const hintLower = (hint || '').toLowerCase();
          if (hintLower.endsWith('.webm')) ext = 'WEBM';
          else if (hintLower.endsWith('.mkv')) ext = 'MKV';
        } else {
          filename = cleanUrl.split('/').pop().split('?')[0] || (hint || 'video.mp4');
          // normalisera till video: m3u8/mpd/ts/m4s -> MP4 så allt sparas som spelbar video
          const rawExt = (cleanUrl.split('.').pop().split('?')[0] || 'MP4').toUpperCase();
          if (['M3U8','M3U','MPD','TS','M4S','FMP4','M2TS'].includes(rawExt)) ext = 'MP4';
          else ext = rawExt.length <= 5 ? rawExt : 'VIDEO';
          if (!filename.includes('.')) filename = filename + '.mp4';
          else if (/\.(m3u8|m3u|mpd|ts|m4s|fmp4)$/i.test(filename)) filename = filename.replace(/\.(m3u8|m3u|mpd|ts|m4s|fmp4)$/i, '.mp4');
        }
        // blob: behålls som blob-url men filnamnet blir alltid .mp4
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
      // 1. Skanna HTML5 media-element med duration (inkl. blob: källor – sparas som .mp4 video)
      document.querySelectorAll('video, audio').forEach(el => {
        const dur = el.duration && !isNaN(el.duration) && isFinite(el.duration) ? el.duration : 0;
        const hintName = el.getAttribute('data-filename') || el.title || '';
        if (el.src) addUrl(el.src, hintName || 'video.mp4', dur);
        if (el.currentSrc) addUrl(el.currentSrc, hintName || 'video.mp4', dur);
        el.querySelectorAll('source').forEach(src => {
          if (src.src) addUrl(src.src, hintName || 'video.mp4', dur);
          if (src.srcset) {
            src.srcset.split(',').forEach(p => {
              const u = p.trim().split(' ')[0];
              if (u) addUrl(u, hintName || 'video.mp4', dur);
            });
          }
        });
        // poster som video-fallback
        if (el.poster) addUrl(el.poster, 'video.mp4', 0);
      });

      // 2. Skanna länkar – alla tillåtna videoformat, konvertera till .mp4 vid behov
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && /\.(mp4|m4v|m4s|fmp4|webm|flv|m3u8|m3u|mpd|ts|m2ts|mov|avi|mkv|ogv|3gp|3g2|wmv|mp3|m4a|aac|wav|ogg|opus|flac)(\?.*)?$/i.test(href)) {
          addUrl(href, a.textContent.trim() || 'video.mp4', 0);
        }
        // även <a download>
        if (a.hasAttribute('download') && href) {
          if (href.startsWith('blob:') || href.startsWith('http')) addUrl(href, a.getAttribute('download') || 'video.mp4', 0);
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
            if (matches) matches.forEach(u => addUrl(u, 'video.mp4', 0));
            const blobMatches = el.textContent.match(BLOB_REGEX);
            if (blobMatches) blobMatches.forEach(u => addUrl(u, 'video.mp4', 0));
          }
          // även inline JSON med media-urler i andra element
          if (el.textContent && el.textContent.length < 50000) {
            const blobM = el.textContent.match(BLOB_REGEX);
            if (blobM) blobM.forEach(u => addUrl(u, 'video.mp4', 0));
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

