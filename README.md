# ⚡ Flash Video Downloader (FVD) — Chrome Extension

<p align="center">
  <img src="icons/icon128.png" alt="FVD Logo" width="128" height="128" />
</p>

<p align="center">
  <a href="https://github.com/nRn-World/FlashVideoDownloader"><img src="https://img.shields.io/badge/version-3.2-blue?style=for-the-badge" alt="version" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge" alt="manifest v3" /></a>
  <a href="#"><img src="https://img.shields.io/badge/license-Educational%20Non--Commercial-orange?style=for-the-badge" alt="license" /></a>
  <img src="https://img.shields.io/badge/PRs-welcome-10b981?style=for-the-badge" alt="prs" />
</p>

<p align="center">
  <b>Fast, modern and reliable video downloader for Chrome.</b><br/>
  Detects <code>MP4 · WEBM · FLV · MKV · MOV · AVI · M3U8 · MPD · TS · MP3</code> + 20 more formats — saves everything as playable video with <b>pause / resume / cancel</b>, <b>smooth 1-100% progress</b> and global background downloads.
</p>

---

## ✨ What's new in v3.2

| Feature | Before | Now |
|---|---|---|
| **Pause / Resume** | — | `⏸ Pause` / `▶ Resume` on card + Active Downloads banner, badge `⏸` |
| **Cancel with confirmation** | — | `✕` → modal <i>"Are you sure you want to stop the download?"</i> → removed from list |
| **Smooth 1-100%** | jumped 5-10% | Offscreen pushes every integer percent instantly, popup ticks `1%` at a time, bar `0.35s linear` |
| **Universal video pipeline** | HLS + single MP4 | Generic pipeline for **all allowed files** incl. `.avi/.mkv/.mov/.webm/.flv/.ts/.m4s/.mpd` + `blob:` — saved with correct MIME (`video/x-msvideo` for .avi etc.) |

> **.avi included?** Yes — detected via `webRequest` + DOM scan, shown with `AVI` badge and downloaded as `.avi` (keeps AVI container) through the same pausable pipeline. Largest file is sorted to the top.

---

## 🚀 Features

- **🌐 Deep Sniffing** — `webRequest.onHeadersReceived` + `content.js` MutationObserver captures network + `<video>`, `<source>`, `<a href>`, `data-*`, embedded `script` URLs and `blob:` sources.
- **🎞️ Universal Video** — 25+ extensions supported, streaming manifests (`m3u8/mpd/m3u/ts/m4s/fmp4`) converted to `.mp4`, regular video keeps its extension (`.avi` stays `.avi`, `.mkv` stays `.mkv`). Largest file is listed first (sorted by size → duration).
- **⚡ Turbo HLS** — 20 parallel workers, `EXTINF` duration summed, `Blob` → `ObjectURL` → `a.download` with no size limit (Offscreen Document).
- **📊 Live Tracking** — total / downloaded duration (`38m 12s → 12m 04s / 38m 12s`), bytes, segments `124/340`.
- **⏯️ Full Control** — Pause/resume anytime, cancel with confirmation, badge shows `⚡ / 47% / ⏸ / ✅`.
- **▶️ Preview** — Built-in player with OSD seek (`←/→ 5s, Shift 10s, Ctrl 30s, J/L`) and volume control.
- **🌍 6 Languages** — EN/SV/TR/ES/FR/AR via `i18n.js` + `chrome.storage`.
- **📜 History** — Last 50 downloads, auto-clean after 24h (optional), time + size + duration.
- **🔒 Respect for protection** — DRM/YouTube and other protected services are not bypassed (see Terms).

---

## 📦 Installation

```bash
git clone https://github.com/nRn-World/FlashVideoDownloader.git
```

1. Open `chrome://extensions/` → enable **Developer mode**.
2. Click **Load unpacked** → select the folder `Flash Video Downloader`.
3. Pin the extension to the toolbar.

Update: `git pull` → click 🔄 **Update** on `chrome://extensions/`.

---

## 🎮 Usage

1. Play a video on any allowed site — it appears in the popup under `All / Video / Streams` (largest first).
2. **Preview** with `▶ Play`, copy link with `📋 Copy`.
3. Click `⬇ Download` — card and banner `⚡ Active Downloads` show `12%`, `124/340`, `2m 03s / 38m 12s`.
4. Use `⏸ Pause` / `▶ Resume` anytime, `✕` to cancel (with confirmation).
5. On `merging → ✅` the file is saved (e.g. `myvideo.avi` or `video_4821.mp4`) — appears in history under ⚙️.

<details>
<summary><b>Supported formats</b></summary>

`mp4, m4v, m4s, fmp4, webm, flv, f4v, m3u8, m3u, mpd, ts, m2ts, mts, mov, avi, mkv, ogv, 3gp, 3g2, wmv, av1, hevc, vob, mpg/mpeg, mp3, m4a, aac, wav, ogg, opus, flac, wma` — plus `blob:` videos from `<video>` elements.

</details>

---

## 🛠️ Tech Stack

```
manifest v3 | background (service worker) | offscreen (BLOBS) | content script | popup
webRequest + DOM-scan  →  tabMedia Map  →  popup render
HLS:        offscreen 20 workers + EXTINF → Blob → ObjectURL
Generic:    offscreen ReadableStream + pause + fake 1-95% for unknown length
Progress:   every integer % pushed instantly, popup animates 1% tick (18-50ms/step), bar 0.35s linear
Sort:       size (bytes) → duration → discoveredAt, largest first
```

| File | Role |
|---|---|
| `background.js` | sniffing, badge, `activeDownloads` Map, `START_HLS/GENERIC_DOWNLOAD` |
| `offscreen.js` | HLS + generic fetch/stream with pause/cancel |
| `content.js` | DOM scan, `blob:` support, smooth seek OSD |
| `popup.js/.html/.css` | UI, pause/stop modal, smooth 1-100, filter, history, sorting |
| `i18n.js` | 6 languages |

---

## 📄 License

**Educational & Non-Commercial Use License** — personal/educational use OK, commercial use requires permission.

Contact: **bynrnworld@gmail.com**

---

## 🔄 Changelog

- **v3.2** — Pause/resume + cancel with confirmation, smooth 1-100% (no jumps), universal video pipeline (all allowed formats incl. `.avi` + `blob:`), keep original extension, MPD/DASH detection, largest file sorted first.
- **v3.1** — Offscreen HLS pipeline (fix empty file), global Active Downloads banner.
- **v3.0 PRO** — Duration tracking, i18n, history, preview.

---

☕ **Support development**: [Buy me a coffee 💜](https://ko-fi.com/nrnworld)

<p align="center">Created with ❤️ by <b>nRn World</b></p>
