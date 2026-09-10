# Flash Video Downloader

<p align="center">
  <img src="icons/icon128.png" alt="Flash Video Downloader" width="96" height="96" />
</p>

<p align="center">
  <strong>A fast, modern Chrome extension that detects and downloads videos from the web.</strong><br/>
  Built with Manifest V3 · Free on the Chrome Web Store · Created by nRn World
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/blbajmihakahbldejkginpccillhakdg"><img src="https://img.shields.io/badge/Download-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white&labelColor=0B57D0" alt="Download on Chrome Web Store" /></a>
  <a href="https://github.com/nRn-World/FlashVideoDownloader"><img src="https://img.shields.io/badge/Version-3.3.0-00C853?style=for-the-badge&logo=semver&logoColor=white&labelColor=00A041" alt="Version 3.3.0" /></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Manifest-V3-FF6D00?style=for-the-badge&logo=googlechrome&logoColor=white&labelColor=E65100" alt="Manifest V3" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-CC%20BY--NC%204.0-00BFA5?style=for-the-badge&logo=creativecommons&logoColor=white&labelColor=00897B" alt="License CC BY-NC 4.0" /></a>
  <a href="https://ko-fi.com/nrnworld"><img src="https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white&labelColor=D32F2F" alt="Support on Ko-fi" /></a>
</p>

---

## Overview

**Flash Video Downloader** helps you save videos you are already watching on supported websites. It combines network sniffing with on-page video detection, so you get a clean list of downloadable media instead of dozens of unrelated segment URLs.

The extension focuses on **visible page videos**, offers **pause / resume / cancel** during downloads, lets you choose **where files are saved**, and ships with **6 languages** out of the box.

### Free vs Pro

**Flash Video Downloader** offers a **Free tier** with all core features, plus an optional **Pro upgrade** ($5.99 one-time) for power users:

- **Free:** Detect videos, download one at a time, pause/resume, last 10 history, all formats
- **Pro:** 3+ concurrent downloads, batch download all, unlimited history, export (CSV/JSON), filename templates, quality picker

[⚡ Learn more about Pro](https://nrn-world.github.io/FlashVideoDownloader/pages/pro.html)

> **Important:** This extension does not bypass DRM. Sites such as YouTube, Netflix, Twitch, Disney+, and Spotify are blocked by design for Chrome Web Store compliance.

---

## Screenshots

<p align="center">
  <img src="Screenshots/SC1.png" alt="Main popup with detected videos" width="780" />
</p>

<p align="center">
  <em>Detect videos on the page, preview them, and download with one click.</em>
</p>

<table align="center">
  <tr>
    <td align="center" width="50%">
      <img src="Screenshots/SC2.png" alt="Download in progress" width="380" /><br/>
      <sub>Live progress with pause, resume, and cancel</sub>
    </td>
    <td align="center" width="50%">
      <img src="Screenshots/SC3.png" alt="Settings and download location" width="380" /><br/>
      <sub>Settings, history, folder picker, and support section</sub>
    </td>
  </tr>
</table>

---

## Features

| Category | Details |
|---|---|
| **Detection** | Network sniffing + visible `<video>` scanning on the active tab |
| **Formats** | MP4, WEBM, FLV, MKV, MOV, AVI, M3U8, MPD, TS, MP3, and more |
| **HLS / streams** | Offscreen pipeline merges segments into a playable file (TS → MP4 remux via mux.js) |
| **Download control** | Pause, resume, cancel, and global active-download banner |
| **Save location** | Ask each time, or save all videos to a folder you pick on your computer |
| **Languages** | English, Svenska, Türkçe, Español, Français, العربية |
| **History** | Last 10 (Free) or Unlimited (Pro) with optional 24-hour auto-cleanup |
| **Pro features** | 3+ concurrent downloads, batch download, history export, filename templates, quality picker |
| **Privacy** | On-demand content script injection · no keyboard capture · blocked-host list |

---

## Download

Get the extension from the Chrome Web Store:

**[⬇ Download Flash Video Downloader](https://chromewebstore.google.com/detail/blbajmihakahbldejkginpccillhakdg)**

https://chromewebstore.google.com/detail/blbajmihakahbldejkginpccillhakdg

1. Open the link
2. Click **Add to Chrome**
3. Pin **Flash Video Downloader** to your toolbar

---

## Installation

### From source (developer mode)

```bash
git clone https://github.com/nRn-World/FlashVideoDownloader.git
cd FlashVideoDownloader
```

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project folder
5. Pin **Flash Video Downloader** to your toolbar

### Update a local install

```bash
git pull origin main
```

Then click **Reload** on the extension card in `chrome://extensions/`.

---

## How to use

1. Open a supported website and **play the video** you want to save.
2. Click the extension icon to open the popup.
3. Press **Refresh** if the video does not appear immediately.
4. Click **Download** on the detected entry.
5. Use **Pause**, **Resume**, or **Cancel** from the card or the **Active Downloads** banner.
6. Open **Settings** to change language, download folder, or view history.

### Download location

- **Default:** Chrome asks where to save each video.
- **Fixed folder:** Disable “Ask where to save each video” and choose a folder on your computer. All future downloads go there automatically.

---

## Supported formats

<details>
<summary><strong>View full format list</strong></summary>

`mp4`, `m4v`, `m4s`, `fmp4`, `webm`, `flv`, `f4v`, `m3u8`, `m3u`, `mpd`, `ts`, `m2ts`, `mts`, `mov`, `avi`, `mkv`, `ogv`, `3gp`, `3g2`, `wmv`, `mp3`, `m4a`, `aac`, `wav`, `ogg`, `opus`, `flac`, plus `blob:` sources from in-page players.

</details>

---

## Project structure

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, permissions, CSP, locales |
| `background.js` | Network sniffing, download state, offscreen orchestration, Pro licensing |
| `offscreen.js` | HLS/generic download engine, blob merge, file delivery |
| `content.js` | Visible video DOM scan (on-demand injection) |
| `popup.js` / `.html` / `.css` | UI, settings, history, progress, Pro upgrade, i18n |
| `license.js` | Pro license validation and feature gating |
| `blocked-hosts.js` | DRM / policy-restricted platform blocklist |
| `storage-handles.js` | File System Access directory handle persistence |
| `i18n.js` | In-extension translations |
| `privacy.html` | Privacy policy for Chrome Web Store |
| `pages/pro.html` | Pro upgrade landing page (GitHub Pages) |

---

## Building a release ZIP

```bat
create_zip.bat
```

This packages the extension for manual upload or Chrome Web Store submission. Publish `privacy.html` online before store submission (see `STORE_LISTING.md`).

---

## Support the project

If Flash Video Downloader helps you, consider supporting development:

**[Buy me a coffee on Ko-fi](https://ko-fi.com/nrnworld)**

---

## License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

- You may share and adapt the material for **non-commercial** use.
- You must give **appropriate credit** and link to the license.
- See [`LICENSE`](LICENSE) for the full text.

---

## Contact

**nRn World**  
Email: [bynrnworld@gmail.com](mailto:bynrnworld@gmail.com)  
GitHub: [nRn-World/FlashVideoDownloader](https://github.com/nRn-World/FlashVideoDownloader)  
Chrome Web Store: [Flash Video Downloader](https://chromewebstore.google.com/detail/blbajmihakahbldejkginpccillhakdg)

---

## Changelog

| Version | Highlights |
|---|---|
| **3.3.0** | Freemium model: Free tier + Pro upgrade ($5.99 lifetime). Pro: 3+ concurrent, batch, unlimited history, export, templates |
| **3.2.5** | Better detection for tube/CMS URLs (`.mp4/`, `/get_file/`), iframe scan, less aggressive preview filter |
| **3.2.4** | Stronger HLS/DASH downloads: page Referer retries, lower parallelism, segment repair, MPD support |
| **3.2.3** | Fix post-download crash (`chrome.storage`), save HLS/blob via offscreen `chrome.downloads` |
| **3.2.2** | Direct `chrome.downloads` for MP4/WEBM, safer defaults for store review, blob via content script |
| **3.2.1** | Chrome Web Store readiness, DRM blocklist, visible-video filtering, folder picker, CC BY-NC license |
| **3.2.0** | Pause/resume/cancel, smooth progress, universal download pipeline, blob support |
| **3.1.0** | Offscreen HLS engine, global active-downloads banner |
| **3.0.0** | i18n, download history, in-popup preview |

---

<p align="center">
  Created by ❤️ © nRn World
</p>
